import { SlackActionMiddlewareArgs, AllMiddlewareArgs, BlockAction } from '@slack/bolt';
import { handleForfeit } from '../services/forfeitService';
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
 * Register all action handlers
 */
export function registerActionHandlers(app: any): void {
  app.action(SLACK_ACTIONS.FORFEIT_SPOT, handleForfeitAction);

  console.log('Action handlers registered');
}
