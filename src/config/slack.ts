import { App, ExpressReceiver } from '@slack/bolt';
import { env } from './environment';

let slackApp: App | null = null;
let receiver: ExpressReceiver | null = null;

/**
 * Initializes Slack Bolt app with Express receiver
 */
export function initializeSlack(): App {
  if (slackApp) {
    return slackApp;
  }

  try {
    // Create Express receiver
    receiver = new ExpressReceiver({
      signingSecret: env.slackSigningSecret,
    });

    slackApp = new App({
      token: env.slackBotToken,
      receiver,
    });

    console.log('Slack app initialized successfully');
    return slackApp;
  } catch (error) {
    console.error('Failed to initialize Slack app:', error);
    throw error;
  }
}

/**
 * Gets the Express receiver
 */
export function getReceiver(): ExpressReceiver {
  if (!receiver) {
    initializeSlack();
  }
  return receiver!;
}

/**
 * Gets the Slack app instance
 */
export function getSlackApp(): App {
  if (!slackApp) {
    return initializeSlack();
  }
  return slackApp;
}

/**
 * Check if a user is an admin
 */
export function isAdmin(userId: string): boolean {
  return env.adminUserIds.includes(userId);
}
