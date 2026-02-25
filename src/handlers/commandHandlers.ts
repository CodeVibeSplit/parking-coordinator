import { SlackCommandMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
import { addVacation, removeVacation, getVacationsForUser } from '../services/vacationService';
import { getStatistics } from '../services/balanceService';
import {
  validateISODate,
  validateVacationPeriod,
} from '../utils/validators';
import {
  formatSchedule,
  formatStatistics,
  formatVacations,
} from '../services/notificationService';
import {
  getParkingAssignmentsInRange,
  setParkingAssignment,
  addAuditLog,
  getUser,
  setUser,
  updateUser,
  updateConfig,
  getConfig,
  getUserPointsHistory,
  getUserPrimaryAssignments,
  getUserParkingHistory,
} from '../utils/firestoreUtils';
import { now } from '../config/firebase';
import { isAdmin } from '../config/slack';
import {
  toISODate,
  addDays,
  getCurrentDate,
  getDayOfWeek,
  isWeekday,
  getCurrentWeekStart,
  fromISODate,
  getBusinessDaysBetween,
  daysDifference,
} from '../utils/dateUtils';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../models/constants';
import type { ParkingAssignment } from '../models/types';

type CommandHandler = (
  args: SlackCommandMiddlewareArgs & AllMiddlewareArgs
) => Promise<void>;

/**
 * Handle /parking-schedule command
 * Usage: /parking-schedule [days]
 */
export const handleScheduleCommand: CommandHandler = async ({
  command,
  ack,
  respond,
}) => {
  await ack();

  try {
    // Parse days parameter (default: 7)
    const days = parseInt(command.text.trim() || '7', 10);
    const validDays = Math.min(Math.max(days, 1), 30); // Limit to 1-30 days

    const today = getCurrentDate();
    // validDays includes today, so we add (validDays - 1) to get the end date
    const endDate = addDays(today, validDays - 1);

    // Get assignments in range
    const assignments = await getParkingAssignmentsInRange(
      toISODate(today),
      toISODate(endDate)
    );

    // Filter for weekdays only
    const weekdayAssignments = assignments.filter((a) =>
      isWeekday(new Date(a.date))
    );

    const scheduleText = formatSchedule(weekdayAssignments, validDays);

    await respond({
      response_type: 'ephemeral',
      text: scheduleText,
    });
  } catch (error) {
    console.error('Error handling schedule command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ ${ERROR_MESSAGES.DATABASE_ERROR}`,
    });
  }
};

/**
 * Handle /parking-vacation command
 * Usage:
 *   /parking-vacation add <YYYY-MM-DD> <YYYY-MM-DD>
 *   /parking-vacation list
 *   /parking-vacation remove <vacation-id>
 */
export const handleVacationCommand: CommandHandler = async ({
  command,
  ack,
  respond,
}) => {
  await ack();

  try {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'add') {
      // Add vacation
      if (args.length < 3) {
        await respond({
          response_type: 'ephemeral',
          text: '❌ Usage: `/parking-vacation add <YYYY-MM-DD> <YYYY-MM-DD>`\nExample: `/parking-vacation add 2026-03-01 2026-03-07`',
        });
        return;
      }

      const startDate = args[1];
      const endDate = args[2];

      // Validate dates
      const validation = validateVacationPeriod(startDate, endDate);
      if (!validation.valid) {
        await respond({
          response_type: 'ephemeral',
          text: `❌ ${validation.error}`,
        });
        return;
      }

      // Add vacation
      await addVacation(command.user_id, startDate, endDate, command.user_id);

      await respond({
        response_type: 'ephemeral',
        text: `✅ ${SUCCESS_MESSAGES.VACATION_ADDED}\n📅 ${startDate} to ${endDate}`,
      });
    } else if (subcommand === 'list') {
      // List vacations
      const vacations = await getVacationsForUser(command.user_id);

      // Filter upcoming/current vacations
      const today = toISODate(getCurrentDate());
      const upcoming = vacations.filter((v) => v.endDate >= today);

      const vacationText = formatVacations(upcoming);

      await respond({
        response_type: 'ephemeral',
        text: vacationText,
      });
    } else if (subcommand === 'remove') {
      // Remove vacation
      if (args.length < 2) {
        await respond({
          response_type: 'ephemeral',
          text: '❌ Usage: `/parking-vacation remove <vacation-id>`\nGet the ID from `/parking-vacation list`',
        });
        return;
      }

      const vacationId = args[1];
      await removeVacation(vacationId, command.user_id);

      await respond({
        response_type: 'ephemeral',
        text: `✅ ${SUCCESS_MESSAGES.VACATION_REMOVED}`,
      });
    } else {
      // Invalid subcommand
      await respond({
        response_type: 'ephemeral',
        text: '❌ Usage:\n' +
          '• `/parking-vacation add <YYYY-MM-DD> <YYYY-MM-DD>` - Add vacation\n' +
          '• `/parking-vacation list` - List your vacations\n' +
          '• `/parking-vacation remove <vacation-id>` - Remove vacation',
      });
    }
  } catch (error) {
    console.error('Error handling vacation command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ ${ERROR_MESSAGES.DATABASE_ERROR}`,
    });
  }
};

/**
 * Handle /parking-stats command
 * Usage: /parking-stats [user-id]
 */
export const handleStatsCommand: CommandHandler = async ({
  command,
  ack,
  respond,
}) => {
  await ack();

  try {
    const userId = command.text.trim() || command.user_id;

    if (userId === 'all') {
      // Show stats for all users
      const stats = await getStatistics();
      const statsText = formatStatistics(stats);

      await respond({
        response_type: 'ephemeral',
        text: statsText,
      });
    } else {
      // Show stats for specific user
      const [user, pointsHistory, primaryAssignments, parkingHistory, vacations] =
        await Promise.all([
          getUser(userId),
          getUserPointsHistory(userId, 3),
          getUserPrimaryAssignments(userId),
          getUserParkingHistory(userId),
          getVacationsForUser(userId),
        ]);

      const primaryAssigned = primaryAssignments.length;
      const primaryParked = primaryAssignments.filter(
        (a) => !a.forfeitedUsers.includes(userId)
      ).length;
      const primaryRatio =
        primaryAssigned > 0 ? `${primaryParked}/${primaryAssigned}` : '—';

      const totalParked = parkingHistory.filter((h) => h.parked).length;

      const vacationDays = vacations.reduce((sum, v) => {
        return sum + getBusinessDaysBetween(fromISODate(v.startDate), fromISODate(v.endDate));
      }, 0);

      const currentScore = user?.points ?? 0;

      const daysSince = user?.registeredAt
        ? daysDifference(getCurrentDate(), user.registeredAt.toDate())
        : null;

      const reasonLabel: Record<string, string> = {
        confirm_before_deadline: 'Confirmed parking',
        forfeit_before_deadline: 'Forfeited in time',
        no_show: 'No-show',
        no_attendance_response: 'No attendance response',
      };

      const pointsLines = pointsHistory.map((entry) => {
        const arrow = entry.delta >= 0 ? '📈' : '📉';
        const sign = entry.delta >= 0 ? '+' : '';
        const label = reasonLabel[entry.reason] ?? entry.reason;
        const datePart = entry.affectedDate ? ` · ${entry.affectedDate}` : '';
        return `${arrow} ${sign}${entry.delta} · ${label}${datePart}`;
      });

      const registeredLine = daysSince !== null ? `📅 Registered ${daysSince} days ago\n` : '';

      const text =
        `*Parking stats for <@${userId}>*\n\n` +
        registeredLine +
        `🏖️ Vacation days: ${vacationDays}\n` +
        `🅿️ Parked days: ${totalParked}\n` +
        `🎯 Primary attendance: ${primaryRatio}\n` +
        `⭐ Reputation score: ${currentScore}` +
        (pointsLines.length > 0
          ? `\n\n*Recent points activity:*\n${pointsLines.join('\n')}`
          : '');

      await respond({
        response_type: 'ephemeral',
        text,
      });
    }
  } catch (error) {
    console.error('Error handling stats command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ ${ERROR_MESSAGES.DATABASE_ERROR}`,
    });
  }
};

/**
 * Handle /parking-admin-override command (admin only)
 * Usage: /parking-admin-override <YYYY-MM-DD> <user1> <user2> <user3>
 */
export const handleAdminOverrideCommand: CommandHandler = async ({
  command,
  ack,
  respond,
}) => {
  await ack();

  try {
    // Check if user is admin
    if (!isAdmin(command.user_id)) {
      await respond({
        response_type: 'ephemeral',
        text: `❌ ${ERROR_MESSAGES.UNAUTHORIZED}`,
      });
      return;
    }

    const args = command.text.trim().split(/\s+/);

    if (args.length < 2) {
      await respond({
        response_type: 'ephemeral',
        text: '❌ Usage: `/parking-admin-override <YYYY-MM-DD> <user1> [user2] [user3]`\nExample: `/parking-admin-override 2026-02-24 U123 U456 U789`',
      });
      return;
    }

    const date = args[0];
    const userIds = args.slice(1);

    // Validate date
    const dateValidation = validateISODate(date);
    if (!dateValidation.valid) {
      await respond({
        response_type: 'ephemeral',
        text: `❌ ${dateValidation.error}`,
      });
      return;
    }

    // Create override assignment
    const assignment: ParkingAssignment = {
      id: date,
      date,
      dayOfWeek: getDayOfWeek(fromISODate(date)),
      assignedUsers: userIds,
      forfeitedUsers: [],
      confirmedUsers: [],
      originalPrimaryUsers: [...userIds],
      secondaryList: [],
      attendedUsers: [],
      absentUsers: [],
      isFinalized: false,
      weekStartDate: toISODate(getCurrentWeekStart()),
    };

    await setParkingAssignment(assignment);

    await addAuditLog('ROTATION_OVERRIDE', command.user_id, {
      date,
      assignedUsers: userIds,
    });

    await respond({
      response_type: 'ephemeral',
      text: `✅ ${SUCCESS_MESSAGES.OVERRIDE_SUCCESS}\n📅 ${date}\n${userIds.map((id) => `<@${id}>`).join(', ')}`,
    });
  } catch (error) {
    console.error('Error handling admin override command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ ${ERROR_MESSAGES.DATABASE_ERROR}`,
    });
  }
};

/**
 * Handle /parking-admin-add-member @user (admin only)
 * Creates a user doc with registeredAt = today and adds them to the team.
 */
export const handleAdminAddMemberCommand: CommandHandler = async ({
  command,
  ack,
  respond,
}) => {
  await ack();

  if (!isAdmin(command.user_id)) {
    await respond({ response_type: 'ephemeral', text: `❌ ${ERROR_MESSAGES.UNAUTHORIZED}` });
    return;
  }

  const arg = command.text.trim();
  const userId = arg.match(/^<@([A-Z0-9]+)(?:\|[^>]+)?>$/)?.[1] ?? arg;

  if (!userId || !userId.startsWith('U')) {
    await respond({
      response_type: 'ephemeral',
      text: '❌ Usage: `/parking-admin-add-member @user`',
    });
    return;
  }

  try {
    const config = await getConfig();
    if (!config) {
      await respond({ response_type: 'ephemeral', text: `❌ ${ERROR_MESSAGES.DATABASE_ERROR}` });
      return;
    }

    if (config.teamMembers.includes(userId)) {
      await respond({
        response_type: 'ephemeral',
        text: `❌ <@${userId}> is already a team member.`,
      });
      return;
    }

    const existing = await getUser(userId);
    if (existing) {
      await updateUser(userId, { isActive: true });
    } else {
      await setUser({
        userId,
        displayName: '',
        registeredAt: now(),
        isActive: true,
        points: 0,
      });
    }

    await updateConfig({
      teamMembers: [...config.teamMembers, userId],
      rotationOrder: [...config.rotationOrder, userId],
    });

    await addAuditLog('ROTATION_OVERRIDE', command.user_id, {
      action: 'add_member',
      userId,
    });

    await respond({
      response_type: 'ephemeral',
      text: `✅ <@${userId}> has been added to the team.`,
    });
  } catch (error) {
    console.error('Error adding member:', error);
    await respond({ response_type: 'ephemeral', text: `❌ ${ERROR_MESSAGES.DATABASE_ERROR}` });
  }
};

/**
 * Handle /parking-admin-remove-member @user (admin only)
 * Sets the user as inactive and removes them from the rotation.
 */
export const handleAdminRemoveMemberCommand: CommandHandler = async ({
  command,
  ack,
  respond,
}) => {
  await ack();

  if (!isAdmin(command.user_id)) {
    await respond({ response_type: 'ephemeral', text: `❌ ${ERROR_MESSAGES.UNAUTHORIZED}` });
    return;
  }

  const arg = command.text.trim();
  const userId = arg.match(/^<@([A-Z0-9]+)(?:\|[^>]+)?>$/)?.[1] ?? arg;

  if (!userId || !userId.startsWith('U')) {
    await respond({
      response_type: 'ephemeral',
      text: '❌ Usage: `/parking-admin-remove-member @user`',
    });
    return;
  }

  try {
    const config = await getConfig();
    if (!config) {
      await respond({ response_type: 'ephemeral', text: `❌ ${ERROR_MESSAGES.DATABASE_ERROR}` });
      return;
    }

    if (!config.teamMembers.includes(userId)) {
      await respond({
        response_type: 'ephemeral',
        text: `❌ <@${userId}> is not a team member.`,
      });
      return;
    }

    await updateUser(userId, { isActive: false });

    await updateConfig({
      teamMembers: config.teamMembers.filter((id) => id !== userId),
      rotationOrder: config.rotationOrder.filter((id) => id !== userId),
    });

    await addAuditLog('ROTATION_OVERRIDE', command.user_id, {
      action: 'remove_member',
      userId,
    });

    await respond({
      response_type: 'ephemeral',
      text: `✅ <@${userId}> has been removed from the team.`,
    });
  } catch (error) {
    console.error('Error removing member:', error);
    await respond({ response_type: 'ephemeral', text: `❌ ${ERROR_MESSAGES.DATABASE_ERROR}` });
  }
};

/**
 * Register all command handlers
 */
export function registerCommandHandlers(app: any): void {
  app.command('/parking-schedule', handleScheduleCommand);
  app.command('/parking-vacation', handleVacationCommand);
  app.command('/parking-stats', handleStatsCommand);
  app.command('/parking-admin-override', handleAdminOverrideCommand);
  app.command('/parking-admin-add-member', handleAdminAddMemberCommand);
  app.command('/parking-admin-remove-member', handleAdminRemoveMemberCommand);

  console.log('Command handlers registered');
}
