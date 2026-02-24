import { getSlackApp } from '../config/slack';
import { env } from '../config/environment';
import { formatDateDisplay } from '../utils/dateUtils';
import { SLACK_ACTIONS } from '../models/constants';
import type { ParkingAssignment, UserStatistics } from '../models/types';

/**
 * Send daily parking notification to the channel
 */
export async function sendDailyNotification(
  assignment: ParkingAssignment
): Promise<string> {
  const app = getSlackApp();
  const date = new Date(assignment.date);
  const dateDisplay = formatDateDisplay(date);

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Parking Tomorrow (${dateDisplay})*\n\nThe following people have parking spots:`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: assignment.assignedUsers.map((userId) => `• <@${userId}>`).join('\n'),
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "_Can't make it? Click the button below to forfeit your spot (until 6:00 PM today)_",
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Forfeit My Spot',
          },
          style: 'danger',
          action_id: SLACK_ACTIONS.FORFEIT_SPOT,
          value: assignment.date,
        },
      ],
    },
  ];

  const result = await app.client.chat.postMessage({
    channel: env.notificationChannelId,
    text: `Parking assignments for ${dateDisplay}`,
    blocks,
  });

  if (!result.ts) {
    throw new Error('Failed to send notification');
  }

  return result.ts;
}

/**
 * Update the daily notification message
 */
export async function updateDailyNotification(
  messageTs: string,
  assignment: ParkingAssignment
): Promise<void> {
  const app = getSlackApp();
  const date = new Date(assignment.date);
  const dateDisplay = formatDateDisplay(date);

  const assignedText =
    assignment.assignedUsers.length > 0
      ? assignment.assignedUsers.map((userId) => `• <@${userId}>`).join('\n')
      : '_No spots assigned_';

  const forfeitedText =
    assignment.forfeitedUsers.length > 0
      ? `\n\n*Forfeited:* ${assignment.forfeitedUsers
          .map((userId) => `<@${userId}>`)
          .join(', ')}`
      : '';

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Parking Tomorrow (${dateDisplay})*\n\nThe following people have parking spots:`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: assignedText + forfeitedText,
      },
    },
  ];

  // Add forfeit button if not finalized
  if (!assignment.isFinalized) {
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "_Can't make it? Click the button below to forfeit your spot (until 6:00 PM today)_",
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Forfeit My Spot',
            },
            style: 'danger',
            action_id: SLACK_ACTIONS.FORFEIT_SPOT,
            value: assignment.date,
          },
        ],
      }
    );
  } else {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '✅ _Assignments finalized_',
        },
      ],
    });
  }

  await app.client.chat.update({
    channel: env.notificationChannelId,
    ts: messageTs,
    text: `Parking assignments for ${dateDisplay}`,
    blocks,
  });
}

/**
 * Send forfeit notification to a specific user
 */
export async function sendForfeitNotification(
  userId: string,
  date: string,
  _originalMessageTs: string
): Promise<void> {
  const app = getSlackApp();
  const dateDisplay = formatDateDisplay(new Date(date));

  await app.client.chat.postEphemeral({
    channel: env.notificationChannelId,
    user: userId,
    text: `You've been assigned a parking spot for ${dateDisplay}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🅿️ You've been assigned a parking spot for *${dateDisplay}*!\n\nSomeone forfeited their spot and you're next in line.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "Can't make it? You can also forfeit your spot until 6:00 PM today.",
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Forfeit My Spot',
            },
            style: 'danger',
            action_id: SLACK_ACTIONS.FORFEIT_SPOT,
            value: date,
          },
        ],
      },
    ],
  });
}

/**
 * Format parking schedule for display
 */
export function formatSchedule(
  assignments: ParkingAssignment[],
  days: number
): string {
  if (assignments.length === 0) {
    return `No parking assignments found for the next ${days} days (including today).`;
  }

  let text = `*Parking Schedule (${days} days starting today)*\n\n`;

  for (const assignment of assignments) {
    const date = new Date(assignment.date);
    const dateDisplay = formatDateDisplay(date);
    const userList = assignment.assignedUsers
      .map((userId) => `<@${userId}>`)
      .join(', ');

    text += `📅 *${dateDisplay}*\n${userList || '_No assignments_'}\n\n`;
  }

  return text;
}

/**
 * Format statistics for display
 */
export function formatStatistics(stats: UserStatistics[]): string {
  if (stats.length === 0) {
    return 'No statistics available yet.';
  }

  let text = '*Parking Statistics*\n\n';

  // Sort by balance score (most owed parking days first)
  const sorted = [...stats].sort((a, b) => a.balanceScore - b.balanceScore);

  for (const stat of sorted) {
    const balanceEmoji = stat.balanceScore < 0 ? '📉' : stat.balanceScore > 0 ? '📈' : '➡️';
    text += `${balanceEmoji} <@${stat.userId}>\n`;
    text += `   Assigned: ${stat.totalDaysAssigned} | Parked: ${stat.totalDaysParked} | Forfeited: ${stat.totalDaysForfeited}\n`;
    text += `   Balance: ${stat.balanceScore > 0 ? '+' : ''}${stat.balanceScore}\n\n`;
  }

  text += '_Balance: positive = parked more than fair share, negative = owed parking days_';

  return text;
}

/**
 * Format vacation list for display
 */
export function formatVacations(
  vacations: Array<{ id: string; startDate: string; endDate: string }>
): string {
  if (vacations.length === 0) {
    return 'No upcoming vacations.';
  }

  let text = '*Your Vacations*\n\n';

  for (const vacation of vacations) {
    text += `🏖️ ${vacation.startDate} to ${vacation.endDate}\n`;
    text += `   ID: \`${vacation.id}\`\n\n`;
  }

  return text;
}

/**
 * Send error message to user
 */
export async function sendErrorMessage(
  userId: string,
  errorMessage: string
): Promise<void> {
  const app = getSlackApp();

  try {
    await app.client.chat.postEphemeral({
      channel: env.notificationChannelId,
      user: userId,
      text: `❌ ${errorMessage}`,
    });
  } catch (error) {
    console.error('Failed to send error message:', error);
  }
}

/**
 * Send success message to user
 */
export async function sendSuccessMessage(
  userId: string,
  message: string
): Promise<void> {
  const app = getSlackApp();

  try {
    await app.client.chat.postEphemeral({
      channel: env.notificationChannelId,
      user: userId,
      text: `✅ ${message}`,
    });
  } catch (error) {
    console.error('Failed to send success message:', error);
  }
}
