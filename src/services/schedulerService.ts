import * as cron from 'node-cron';
import {
  getCurrentDate,
  getNextWorkday,
  toISODate,
  getDayOfWeek,
  isWeekday,
  getCurrentWeekStart,
  getWeekStart,
  addDays,
} from '../utils/dateUtils';
import {
  getParkingAssignment,
  setParkingAssignment,
  updateParkingAssignment,
  addAuditLog,
} from '../utils/firestoreUtils';
import { sendDailyNotification, updateDailyNotification, sendAttendanceCheck, sendWeeklyAnnouncement } from './notificationService';
import { checkAndResetWeeklyRotation } from './rotationService';
import { autoForfeitUnconfirmedUsers } from './forfeitService';
import { getSecondaryList, awardPoints } from './pointsService';
import { calculateWeeklyPrimaries, createWeeklySchedule, getDailyAssignees, getWeeklySchedule } from './weeklyScheduleService';
import { now } from '../config/firebase';
import type { ParkingAssignment } from '../models/types';

let isInitialized = false;

/**
 * Initialize the scheduler with cron jobs
 */
export function initializeScheduler(): void {
  if (isInitialized) {
    console.log('Scheduler already initialized');
    return;
  }

  console.log('Initializing scheduler...');

  // Daily notification at 16:00 (4 PM) Monday-Friday
  // Cron format: minute hour * * day-of-week
  // 0 16 * * 1-5 = 16:00 on Monday through Friday
  cron.schedule('0 16 * * 1-5', async () => {
    console.log('Running daily notification job at 16:00');
    try {
      await sendDailyNotificationJob();
    } catch (error) {
      console.error('Error in daily notification job:', error);
    }
  }, {
    timezone: 'Europe/Zagreb'
  });

  // Attendance check at 12:00 (noon) Monday-Friday
  cron.schedule('0 12 * * 1-5', async () => {
    console.log('Running attendance check job at 12:00');
    try {
      await sendAttendanceCheckJob();
    } catch (error) {
      console.error('Error in attendance check job:', error);
    }
  }, {
    timezone: 'Europe/Zagreb'
  });

  // Close forfeit window at 18:00 (6 PM) Monday-Friday
  cron.schedule('0 18 * * 1-5', async () => {
    console.log('Running forfeit window close job at 18:00');
    try {
      await closeForfeitWindowJob();
    } catch (error) {
      console.error('Error in forfeit window close job:', error);
    }
  }, {
    timezone: 'Europe/Zagreb'
  });

  // Weekly schedule announcement every Friday at 16:00
  cron.schedule('0 16 * * 5', async () => {
    console.log('Running weekly schedule announcement job at 16:00 Friday');
    try {
      await sendWeeklyAnnouncementJob();
    } catch (error) {
      console.error('Error in weekly schedule announcement job:', error);
    }
  }, {
    timezone: 'Europe/Zagreb'
  });

  // Check for week boundary at 00:01 daily
  cron.schedule('1 0 * * *', async () => {
    console.log('Running week boundary check at 00:01');
    try {
      await handleWeekBoundaryJob();
    } catch (error) {
      console.error('Error in week boundary job:', error);
    }
  }, {
    timezone: 'Europe/Zagreb'
  });

  isInitialized = true;
  console.log('Scheduler initialized successfully');
  console.log('- Weekly announcement: 16:00 Friday');
  console.log('- Daily notification: 16:00 Mon-Fri');
  console.log('- Attendance check: 12:00 Mon-Fri');
  console.log('- Forfeit window close: 18:00 Mon-Fri');
  console.log('- Week boundary check: 00:01 daily');
}

/**
 * Send daily notification job
 */
async function sendDailyNotificationJob(force = false): Promise<void> {
  const today = getCurrentDate();

  // Only run on weekdays
  if (!isWeekday(today)) {
    console.log('Not a weekday, skipping notification');
    return;
  }

  const tomorrow = getNextWorkday();
  const tomorrowStr = toISODate(tomorrow);

  // Check if notification already sent
  const existing = await getParkingAssignment(tomorrowStr);
  if (!force && existing && existing.notificationSentAt) {
    console.log(`Notification already sent for ${tomorrowStr}`);
    return;
  }

  // Calculate assignments for tomorrow using ratio-based weekly schedule
  const assignedUsers = await getDailyAssignees(tomorrowStr);

  if (assignedUsers.length === 0) {
    console.log(`No users available for parking on ${tomorrowStr}`);
    return;
  }

  // Compute secondary list (users eligible to fill forfeited spots)
  const secondaryListWithPoints = await getSecondaryList(tomorrowStr, assignedUsers);
  const secondaryListIds = secondaryListWithPoints.map((u) => u.userId);

  // Create or update assignment
  const assignment: ParkingAssignment = {
    id: tomorrowStr,
    date: tomorrowStr,
    dayOfWeek: getDayOfWeek(tomorrow),
    assignedUsers,
    forfeitedUsers: [],
    confirmedUsers: [],
    originalPrimaryUsers: [...assignedUsers],
    secondaryList: secondaryListIds,
    attendedUsers: [],
    absentUsers: [],
    notificationSentAt: now(),
    notificationMessageTs: '',
    isFinalized: false,
    weekStartDate: toISODate(getCurrentWeekStart()),
  };

  // Send notification (includes secondary list with points)
  const messageTs = await sendDailyNotification(assignment, secondaryListWithPoints);
  assignment.notificationMessageTs = messageTs;

  // Save to database
  await setParkingAssignment(assignment);

  await addAuditLog('ASSIGNMENT_CREATED', 'system', {
    date: tomorrowStr,
    assignedUsers,
    secondaryList: secondaryListIds,
  });

  console.log(`Daily notification sent for ${tomorrowStr}`);
}

/**
 * Close forfeit window and finalize assignments
 */
async function closeForfeitWindowJob(): Promise<void> {
  const today = getCurrentDate();

  // Only run on weekdays
  if (!isWeekday(today)) {
    console.log('Not a weekday, skipping forfeit window close');
    return;
  }

  const tomorrow = getNextWorkday();
  const tomorrowStr = toISODate(tomorrow);

  const assignment = await getParkingAssignment(tomorrowStr);
  if (!assignment) {
    console.log(`No assignment found for ${tomorrowStr}`);
    return;
  }

  if (assignment.isFinalized) {
    console.log(`Assignment already finalized for ${tomorrowStr}`);
    return;
  }

  // Auto-forfeit any users who didn't confirm before window close
  const autoForfeited = await autoForfeitUnconfirmedUsers(tomorrowStr);
  if (autoForfeited.length > 0) {
    console.log(`Auto-forfeited ${autoForfeited.length} user(s) for ${tomorrowStr}: ${autoForfeited.join(', ')}`);
  }

  // Re-fetch assignment after auto-forfeits may have changed it
  const finalAssignment = await getParkingAssignment(tomorrowStr);
  if (!finalAssignment) {
    console.log(`Assignment not found after auto-forfeit for ${tomorrowStr}`);
    return;
  }

  // Finalize the assignment
  await updateParkingAssignment(tomorrowStr, {
    isFinalized: true,
    finalizedAt: now(),
  });

  // Update the message
  if (finalAssignment.notificationMessageTs) {
    finalAssignment.isFinalized = true;
    await updateDailyNotification(
      finalAssignment.notificationMessageTs,
      finalAssignment
    );
  }

  await addAuditLog('ASSIGNMENT_FINALIZED', 'system', {
    date: tomorrowStr,
    finalAssignedUsers: finalAssignment.assignedUsers,
    forfeitedUsers: finalAssignment.forfeitedUsers,
    autoForfeitedUsers: autoForfeited,
  });

  console.log(`Forfeit window closed and rotation advanced for ${tomorrowStr}`);

  // Close today's attendance and apply penalties
  const todayStr = toISODate(today);
  await closeAttendanceJob(todayStr);
}

/**
 * Send attendance check to today's assigned users (12:00 job)
 */
async function sendAttendanceCheckJob(): Promise<void> {
  const today = getCurrentDate();

  if (!isWeekday(today)) {
    console.log('Not a weekday, skipping attendance check');
    return;
  }

  const todayStr = toISODate(today);
  const assignment = await getParkingAssignment(todayStr);

  if (!assignment) {
    console.log(`No assignment found for today (${todayStr}), skipping attendance check`);
    return;
  }

  if (assignment.attendanceCheckSentAt) {
    console.log(`Attendance check already sent for ${todayStr}`);
    return;
  }

  if (assignment.assignedUsers.length === 0) {
    console.log(`No assigned users for ${todayStr}, skipping attendance check`);
    return;
  }

  await sendAttendanceCheck(assignment);

  await addAuditLog('ATTENDANCE_CHECK_SENT', 'system', {
    date: todayStr,
    assignedUsers: assignment.assignedUsers,
  });
}

/**
 * Close today's attendance window and apply penalties (called from 18:00 job)
 */
async function closeAttendanceJob(todayStr: string): Promise<void> {
  const assignment = await getParkingAssignment(todayStr);
  if (!assignment) {
    console.log(`closeAttendanceJob: no assignment for ${todayStr}`);
    return;
  }

  const attendedUsers = assignment.attendedUsers ?? [];
  const absentUsers = assignment.absentUsers ?? [];

  // Penalize non-responders: assigned but neither attended nor absent
  const nonResponders = assignment.assignedUsers.filter(
    (u) => !attendedUsers.includes(u) && !absentUsers.includes(u)
  );

  for (const userId of nonResponders) {
    await awardPoints(userId, -1, 'no_attendance_response', todayStr);
    console.log(`Applied -1 (no attendance response) to ${userId} for ${todayStr}`);
  }

  // Penalize no-shows (clicked "No, I didn't park")
  for (const userId of absentUsers) {
    await awardPoints(userId, -5, 'no_show', todayStr);
    console.log(`Applied -5 (no show) to ${userId} for ${todayStr}`);
  }

  await addAuditLog('ATTENDANCE_CLOSED', 'system', {
    date: todayStr,
    nonResponders,
    absentUsers,
  });

  console.log(`Attendance closed for ${todayStr}: ${nonResponders.length} non-responder(s), ${absentUsers.length} absent`);
}

/**
 * Send weekly parking schedule announcement (Friday 16:00)
 */
async function sendWeeklyAnnouncementJob(): Promise<void> {
  const today = getCurrentDate();
  const nextMonday = addDays(getWeekStart(today), 7);
  const nextMondayStr = toISODate(nextMonday);

  const existing = await getWeeklySchedule(nextMondayStr);
  if (existing) {
    console.log(`Weekly schedule already announced for ${nextMondayStr}`);
    return;
  }

  const primaryUserIds = await calculateWeeklyPrimaries(nextMondayStr);
  await createWeeklySchedule(nextMondayStr, primaryUserIds);
  await sendWeeklyAnnouncement(nextMondayStr, primaryUserIds);

  console.log(`Weekly schedule announced for ${nextMondayStr}: ${primaryUserIds.join(', ')}`);
}

/**
 * Handle week boundary (check for Monday and reset rotation)
 */
async function handleWeekBoundaryJob(): Promise<void> {
  const today = getCurrentDate();
  const dayOfWeek = getDayOfWeek(today);

  // Only run on Monday
  if (dayOfWeek === 'Monday') {
    console.log('Monday detected, checking weekly rotation reset');
    await checkAndResetWeeklyRotation(today);

    // Generate weekly schedule if the Friday announcement job was missed
    const weekStartStr = toISODate(getCurrentWeekStart());
    const existing = await getWeeklySchedule(weekStartStr);
    if (!existing) {
      const primaryUserIds = await calculateWeeklyPrimaries(weekStartStr);
      await createWeeklySchedule(weekStartStr, primaryUserIds);
      console.log(`Weekly schedule generated via Monday fallback for ${weekStartStr}`);
    }
  }
}

/**
 * Manually trigger daily notification (for testing)
 */
export async function triggerDailyNotification(force = false): Promise<void> {
  console.log('Manually triggering daily notification');
  await sendDailyNotificationJob(force);
}

/**
 * Manually trigger forfeit window close (for testing)
 */
export async function triggerForfeitWindowClose(): Promise<void> {
  console.log('Manually triggering forfeit window close');
  await closeForfeitWindowJob();
}

/**
 * Manually trigger week boundary check (for testing)
 */
export async function triggerWeekBoundary(): Promise<void> {
  console.log('Manually triggering week boundary check');
  await handleWeekBoundaryJob();
}

/**
 * Manually trigger weekly schedule announcement (for testing)
 */
export async function triggerWeeklyAnnouncement(): Promise<void> {
  console.log('Manually triggering weekly announcement');
  await sendWeeklyAnnouncementJob();
}
