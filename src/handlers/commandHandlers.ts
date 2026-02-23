import { SlackCommandMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
import { addVacation, removeVacation, getVacationsForUser } from '../services/vacationService';
import { getStatistics, getUserStatistics } from '../services/balanceService';
import {
  validateISODate,
  validateDateRange,
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
} from '../utils/firestoreUtils';
import { isAdmin } from '../config/slack';
import {
  toISODate,
  addDays,
  getCurrentDate,
  getDayOfWeek,
  isWeekday,
  getCurrentWeekStart,
  fromISODate,
} from '../utils/dateUtils';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../models/constants';
import { now } from '../config/firebase';
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
      const stats = await getUserStatistics(userId);

      const balanceEmoji = stats.balanceScore < 0 ? '📉' : stats.balanceScore > 0 ? '📈' : '➡️';

      const text =
        `*Parking Statistics for <@${userId}>*\n\n` +
        `📊 Days Assigned: ${stats.totalDaysAssigned}\n` +
        `🅿️ Days Parked: ${stats.totalDaysParked}\n` +
        `❌ Days Forfeited: ${stats.totalDaysForfeited}\n` +
        `${balanceEmoji} Balance: ${stats.balanceScore > 0 ? '+' : ''}${stats.balanceScore}\n\n` +
        `_Balance: positive = parked more than fair share, negative = owed parking days_`;

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
 * Register all command handlers
 */
export function registerCommandHandlers(app: any): void {
  app.command('/parking-schedule', handleScheduleCommand);
  app.command('/parking-vacation', handleVacationCommand);
  app.command('/parking-stats', handleStatsCommand);
  app.command('/parking-admin-override', handleAdminOverrideCommand);

  console.log('Command handlers registered');
}
