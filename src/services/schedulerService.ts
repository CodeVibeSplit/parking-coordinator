import * as cron from 'node-cron';
import {
  getCurrentDate,
  getNextWorkday,
  toISODate,
  getDayOfWeek,
  isWeekday,
  getCurrentWeekStart,
} from '../utils/dateUtils';
import {
  getParkingAssignment,
  setParkingAssignment,
  updateParkingAssignment,
  addAuditLog,
} from '../utils/firestoreUtils';
import { sendDailyNotification, updateDailyNotification } from './notificationService';
import { calculateNextAssignments, advanceRotation, checkAndResetWeeklyRotation } from './rotationService';
import { getConfig } from '../utils/firestoreUtils';
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
  console.log('- Daily notification: 16:00 Mon-Fri');
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

  const config = await getConfig();
  if (!config) {
    throw new Error('Configuration not found');
  }

  // Calculate assignments for tomorrow
  const assignedUsers = await calculateNextAssignments(
    tomorrow,
    config.availableSpots
  );

  if (assignedUsers.length === 0) {
    console.log(`No users available for parking on ${tomorrowStr}`);
    return;
  }

  // Create or update assignment
  const assignment: ParkingAssignment = {
    id: tomorrowStr,
    date: tomorrowStr,
    dayOfWeek: getDayOfWeek(tomorrow),
    assignedUsers,
    forfeitedUsers: [],
    notificationSentAt: now(),
    notificationMessageTs: '',
    isFinalized: false,
    weekStartDate: toISODate(getCurrentWeekStart()),
  };

  // Send notification
  const messageTs = await sendDailyNotification(assignment);
  assignment.notificationMessageTs = messageTs;

  // Save to database
  await setParkingAssignment(assignment);

  await addAuditLog('ASSIGNMENT_CREATED', 'system', {
    date: tomorrowStr,
    assignedUsers,
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

  // Finalize the assignment
  await updateParkingAssignment(tomorrowStr, {
    isFinalized: true,
    finalizedAt: now(),
  });

  // Update the message
  if (assignment.notificationMessageTs) {
    assignment.isFinalized = true;
    await updateDailyNotification(
      assignment.notificationMessageTs,
      assignment
    );
  }

  // Advance rotation
  await advanceRotation(assignment.assignedUsers.length);

  await addAuditLog('ASSIGNMENT_FINALIZED', 'system', {
    date: tomorrowStr,
    finalAssignedUsers: assignment.assignedUsers,
    forfeitedUsers: assignment.forfeitedUsers,
  });

  console.log(`Forfeit window closed and rotation advanced for ${tomorrowStr}`);
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
