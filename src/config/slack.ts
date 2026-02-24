import { App, ExpressReceiver } from '@slack/bolt';
import { env } from './environment';

let slackApp: App | null = null;
let receiver: ExpressReceiver | null = null;

const isProduction = env.nodeEnv === 'production';

/**
 * Initializes Slack Bolt app.
 * Production: HTTP mode via ExpressReceiver.
 * Development: Socket Mode (no public URL required).
 */
export function initializeSlack(): App {
  if (slackApp) {
    return slackApp;
  }

  try {
    if (isProduction) {
      receiver = new ExpressReceiver({
        signingSecret: env.slackSigningSecret,
      });
      slackApp = new App({
        token: env.slackBotToken,
        receiver,
      });
    } else {
      slackApp = new App({
        token: env.slackBotToken,
        appToken: env.slackAppToken,
        socketMode: true,
      });
    }

    console.log(`Slack app initialized (${isProduction ? 'HTTP mode' : 'Socket Mode'})`);
    return slackApp;
  } catch (error) {
    console.error('Failed to initialize Slack app:', error);
    throw error;
  }
}

/**
 * Gets the Express receiver. Returns null in Socket Mode (development).
 */
export function getReceiver(): ExpressReceiver | null {
  return receiver;
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
