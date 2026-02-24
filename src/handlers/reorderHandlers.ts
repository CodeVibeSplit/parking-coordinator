import { SlackCommandMiddlewareArgs, AllMiddlewareArgs, BlockAction, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';
import { isAdmin } from '../config/slack';
import { ERROR_MESSAGES, SLACK_ACTIONS } from '../models/constants';
import { getParkingAssignment, updateParkingAssignment, addAuditLog } from '../utils/firestoreUtils';
import { validateISODate } from '../utils/validators';
import { formatDateDisplay, fromISODate, toISODate, getCurrentDate } from '../utils/dateUtils';

type CommandHandler = (
  args: SlackCommandMiddlewareArgs & AllMiddlewareArgs
) => Promise<void>;

/**
 * Handle /parking-admin-reorder command (admin only)
 * Opens a modal to select a date first
 */
export const handleReorderCommand: CommandHandler = async ({
  command,
  ack,
  respond,
  client,
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

    // Open modal to select date
    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildDateSelectionModal(),
    });
  } catch (error) {
    console.error('Error handling reorder command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ ${ERROR_MESSAGES.DATABASE_ERROR}`,
    });
  }
};

/**
 * Build the date selection modal
 */
function buildDateSelectionModal(): any {
  const today = getCurrentDate();
  const todayStr = toISODate(today);

  return {
    type: 'modal',
    callback_id: 'reorder_date_selection_modal',
    title: {
      type: 'plain_text',
      text: 'Select Date',
    },
    submit: {
      type: 'plain_text',
      text: 'Next',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Reorder Parking Assignment*\n\nSelect the date you want to reorder:',
        },
      },
      {
        type: 'input',
        block_id: 'date_input',
        element: {
          type: 'datepicker',
          action_id: 'selected_date',
          initial_date: todayStr,
          placeholder: {
            type: 'plain_text',
            text: 'Select a date',
          },
        },
        label: {
          type: 'plain_text',
          text: 'Date',
        },
      },
    ],
  };
}

/**
 * Handle date selection modal submission
 */
export const handleDateSelectionSubmit = async ({
  ack,
  body,
  view,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    const userId = body.user.id;

    // Check if user is admin
    if (!isAdmin(userId)) {
      await ack({
        response_action: 'errors',
        errors: {
          date_input: ERROR_MESSAGES.UNAUTHORIZED,
        },
      });
      return;
    }

    // Get selected date
    const selectedDate = view.state.values.date_input.selected_date.selected_date;

    if (!selectedDate) {
      await ack({
        response_action: 'errors',
        errors: {
          date_input: 'Please select a date',
        },
      });
      return;
    }

    // Validate date
    const dateValidation = validateISODate(selectedDate);
    if (!dateValidation.valid) {
      await ack({
        response_action: 'errors',
        errors: {
          date_input: dateValidation.error || 'Invalid date',
        },
      });
      return;
    }

    // Get parking assignment for this date
    const assignment = await getParkingAssignment(selectedDate);

    if (!assignment || assignment.assignedUsers.length === 0) {
      await ack({
        response_action: 'errors',
        errors: {
          date_input: 'No parking assignment found for this date',
        },
      });
      return;
    }

    // Acknowledge and open the reorder modal
    await ack({
      response_action: 'update',
      view: buildReorderModal(selectedDate, assignment.assignedUsers),
    });
  } catch (error) {
    console.error('Error handling date selection:', error);
    await ack({
      response_action: 'errors',
      errors: {
        date_input: 'An error occurred. Please try again.',
      },
    });
  }
};

/**
 * Build the reorder modal for a specific date
 */
function buildReorderModal(date: string, assignedUsers: string[]): any {
  const dateObj = fromISODate(date);
  const dateDisplay = formatDateDisplay(dateObj);

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Reorder Parking for ${dateDisplay}*\n\nUse the ⬆️ and ⬇️ buttons to reorder assigned users.`,
      },
    },
    {
      type: 'divider',
    },
  ];

  // Add each assigned user with up/down buttons
  assignedUsers.forEach((userId, index) => {
    const isFirst = index === 0;
    const isLast = index === assignedUsers.length - 1;

    // Add section with user name
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${index + 1}.* <@${userId}>`,
      },
    });

    // Add action buttons if not first or last
    const buttons: any[] = [];

    // Add move up button (except for first item)
    if (!isFirst) {
      buttons.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '⬆️ Move Up',
          emoji: true,
        },
        action_id: `${SLACK_ACTIONS.REORDER_MOVE}_up_${index}`,
        value: `up_${index}`,
      });
    }

    // Add move down button (except for last item)
    if (!isLast) {
      buttons.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '⬇️ Move Down',
          emoji: true,
        },
        action_id: `${SLACK_ACTIONS.REORDER_MOVE}_down_${index}`,
        value: `down_${index}`,
      });
    }

    if (buttons.length > 0) {
      blocks.push({
        type: 'actions',
        elements: buttons,
      });
    }

    // Add a divider after each member (except the last one)
    if (index < assignedUsers.length - 1) {
      blocks.push({
        type: 'divider',
      });
    }
  });

  return {
    type: 'modal',
    callback_id: 'reorder_assignment_modal',
    private_metadata: JSON.stringify({ date, assignedUsers }),
    title: {
      type: 'plain_text',
      text: 'Reorder Assignment',
    },
    submit: {
      type: 'plain_text',
      text: 'Save Order',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks,
  };
}

/**
 * Handle move up/down button clicks
 */
export const handleReorderMoveAction = async ({
  body,
  ack,
  client,
}: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();

  try {
    const action = body.actions[0];
    if (action.type !== 'button') return;

    // Parse value: "up_3" or "down_2"
    const [direction, indexStr] = (action.value || '').split('_');
    const index = parseInt(indexStr, 10);

    const view = (body as any).view;
    const metadata = JSON.parse(view.private_metadata);
    const date = metadata.date;
    const assignedUsers: string[] = [...metadata.assignedUsers];

    // Perform the swap
    if (direction === 'up' && index > 0) {
      // Move up (swap with previous)
      [assignedUsers[index - 1], assignedUsers[index]] = [assignedUsers[index], assignedUsers[index - 1]];
    } else if (direction === 'down' && index < assignedUsers.length - 1) {
      // Move down (swap with next)
      [assignedUsers[index], assignedUsers[index + 1]] = [assignedUsers[index + 1], assignedUsers[index]];
    }

    // Update the modal with new order
    await client.views.update({
      view_id: view.id,
      hash: view.hash,
      view: buildReorderModal(date, assignedUsers),
    });
  } catch (error) {
    console.error('Error handling reorder move action:', error);
  }
};

/**
 * Handle reorder modal submission
 */
export const handleReorderModalSubmit = async ({
  ack,
  body,
  view,
  client,
}: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();

  try {
    const userId = body.user.id;

    // Check if user is admin
    if (!isAdmin(userId)) {
      return;
    }

    const metadata = JSON.parse(view.private_metadata);
    const date: string = metadata.date;
    const newAssignedUsers: string[] = metadata.assignedUsers;

    // Get original assignment for audit log
    const originalAssignment = await getParkingAssignment(date);
    const oldAssignedUsers = originalAssignment?.assignedUsers || [];

    // Update the parking assignment
    await updateParkingAssignment(date, {
      assignedUsers: newAssignedUsers,
    });

    // Add audit log entry
    await addAuditLog(
      'ROTATION_OVERRIDE',
      userId,
      {
        action: 'reorder_assignment',
        date,
        oldOrder: oldAssignedUsers,
        newOrder: newAssignedUsers,
      },
      date
    );

    const dateObj = fromISODate(date);
    const dateDisplay = formatDateDisplay(dateObj);

    console.log(`Parking assignment for ${date} reordered by ${userId}:`, newAssignedUsers);

    // Send success message
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `✅ Parking assignment for *${dateDisplay}* has been successfully reordered!\n\nNew order:\n` +
        newAssignedUsers.map((id, i) => `${i + 1}. <@${id}>`).join('\n'),
    });
  } catch (error) {
    console.error('Error handling reorder modal submit:', error);
  }
};

/**
 * Register all reorder handlers
 */
export function registerReorderHandlers(app: any): void {
  app.command('/parking-admin-reorder', handleReorderCommand);

  // Handle date selection modal
  app.view('reorder_date_selection_modal', handleDateSelectionSubmit);

  // Handle move up/down actions with pattern matching
  app.action(new RegExp(`^${SLACK_ACTIONS.REORDER_MOVE}_(up|down)_\\d+$`), handleReorderMoveAction);

  // Handle reorder modal submission
  app.view('reorder_assignment_modal', handleReorderModalSubmit);

  console.log('Reorder handlers registered');
}
