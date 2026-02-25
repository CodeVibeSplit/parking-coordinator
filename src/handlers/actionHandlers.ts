import { SlackActionMiddlewareArgs, AllMiddlewareArgs, BlockAction } from '@slack/bolt';
import { handleForfeit, handleConfirm } from '../services/forfeitService';
import { awardPoints } from '../services/pointsService';
import { updateParkingAssignment } from '../utils/firestoreUtils';
import { getParkingAssignment } from '../utils/firestoreUtils';
import { SLACK_ACTIONS } from '../models/constants';

type ActionHandler = (
  args: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs
) => Promise<void>;

/**
 * Handle forfeit button action
 */
export const handleForfeitAction: ActionHandler = async ({
  body,
  ack,
  respond,
}) => {
  await ack();

  try {
    // Extract user ID and date from action
    const userId = body.user.id;
    const action = body.actions[0];

    if (action.type !== 'button') {
      console.error('Unexpected action type:', action.type);
      return;
    }

    const date = action.value;
    const messageTs = body.message?.ts || '';

    if (!date) {
      await respond({
        response_type: 'ephemeral',
        text: '❌ Error: Could not determine parking date.',
      });
      return;
    }

    console.log(`Processing forfeit for user ${userId} on date ${date}`);

    // Handle forfeit
    const result = await handleForfeit(userId, date, messageTs);

    // Send response
    await respond({
      response_type: 'ephemeral',
      text: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
    });
  } catch (error) {
    console.error('Error handling forfeit action:', error);
    await respond({
      response_type: 'ephemeral',
      text: '❌ An error occurred while processing your forfeit. Please try again.',
    });
  }
};

/**
 * Handle confirm button action
 */
export const handleConfirmAction: ActionHandler = async ({
  body,
  ack,
  respond,
}) => {
  await ack();

  try {
    const userId = body.user.id;
    const action = body.actions[0];

    if (action.type !== 'button') {
      console.error('Unexpected action type:', action.type);
      return;
    }

    const date = action.value;
    const messageTs = body.message?.ts || '';

    if (!date) {
      await respond({
        response_type: 'ephemeral',
        text: '❌ Error: Could not determine parking date.',
      });
      return;
    }

    console.log(`Processing confirm for user ${userId} on date ${date}`);

    const result = await handleConfirm(userId, date, messageTs);

    await respond({
      response_type: 'ephemeral',
      text: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
    });
  } catch (error) {
    console.error('Error handling confirm action:', error);
    await respond({
      response_type: 'ephemeral',
      text: '❌ An error occurred while processing your confirmation. Please try again.',
    });
  }
};

/**
 * Handle "Yes, I parked" attendance response
 */
export const handleParkedYesAction: ActionHandler = async ({
  body,
  ack,
  respond,
}) => {
  await ack();

  try {
    const userId = body.user.id;
    const action = body.actions[0];

    if (action.type !== 'button') return;

    const date = action.value;
    if (!date) {
      await respond({ response_type: 'ephemeral', text: '❌ Could not determine parking date.' });
      return;
    }

    const assignment = await getParkingAssignment(date);
    if (!assignment) {
      await respond({ response_type: 'ephemeral', text: '❌ No assignment found for this date.' });
      return;
    }

    const attendedUsers = assignment.attendedUsers ?? [];
    const absentUsers = assignment.absentUsers ?? [];

    if (attendedUsers.includes(userId) || absentUsers.includes(userId)) {
      await respond({ response_type: 'ephemeral', text: '✅ Your attendance has already been recorded.' });
      return;
    }

    await updateParkingAssignment(date, {
      attendedUsers: [...attendedUsers, userId],
    });

    await respond({ response_type: 'ephemeral', text: '✅ Thanks for confirming!' });
    console.log(`Attendance confirmed (parked) for user ${userId} on ${date}`);
  } catch (error) {
    console.error('Error handling parked_yes action:', error);
    await respond({ response_type: 'ephemeral', text: '❌ An error occurred. Please try again.' });
  }
};

/**
 * Handle "No, I didn't park" attendance response
 */
export const handleParkedNoAction: ActionHandler = async ({
  body,
  ack,
  respond,
}) => {
  await ack();

  try {
    const userId = body.user.id;
    const action = body.actions[0];

    if (action.type !== 'button') return;

    const date = action.value;
    if (!date) {
      await respond({ response_type: 'ephemeral', text: '❌ Could not determine parking date.' });
      return;
    }

    const assignment = await getParkingAssignment(date);
    if (!assignment) {
      await respond({ response_type: 'ephemeral', text: '❌ No assignment found for this date.' });
      return;
    }

    const attendedUsers = assignment.attendedUsers ?? [];
    const absentUsers = assignment.absentUsers ?? [];

    if (attendedUsers.includes(userId) || absentUsers.includes(userId)) {
      await respond({ response_type: 'ephemeral', text: '✅ Your attendance has already been recorded.' });
      return;
    }

    await updateParkingAssignment(date, {
      absentUsers: [...absentUsers, userId],
    });

    // Apply -5 immediately for no-show
    await awardPoints(userId, -5, 'no_show', date);

    await respond({ response_type: 'ephemeral', text: '✅ Got it, noted.' });
    console.log(`Attendance recorded (absent) for user ${userId} on ${date}, applied -5 points`);
  } catch (error) {
    console.error('Error handling parked_no action:', error);
    await respond({ response_type: 'ephemeral', text: '❌ An error occurred. Please try again.' });
  }
};

/**
 * Register all action handlers
 */
export function registerActionHandlers(app: any): void {
  app.action(SLACK_ACTIONS.FORFEIT_SPOT, handleForfeitAction);
  app.action(SLACK_ACTIONS.CONFIRM_PARKING, handleConfirmAction);
  app.action(SLACK_ACTIONS.PARKED_YES, handleParkedYesAction);
  app.action(SLACK_ACTIONS.PARKED_NO, handleParkedNoAction);

  console.log('Action handlers registered');
}
