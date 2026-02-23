import * as dotenv from 'dotenv';
import { EnvConfig } from '../models/types';

// Load environment variables
dotenv.config();

/**
 * Validates and parses environment variables
 */
export function loadEnvironment(): EnvConfig {
  const requiredVars = [
    'SLACK_BOT_TOKEN',
    'SLACK_SIGNING_SECRET',
    'SLACK_APP_TOKEN',
    'NOTIFICATION_CHANNEL_ID',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'ADMIN_USER_IDS',
  ];

  // Check for missing required variables
  const missing = requiredVars.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  // Parse admin user IDs
  const adminUserIds = process.env.ADMIN_USER_IDS!.split(',').map((id) =>
    id.trim()
  );

  // Validate admin user IDs format
  const invalidIds = adminUserIds.filter((id) => !id.startsWith('U'));
  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid admin user ID format: ${invalidIds.join(', ')}. User IDs should start with 'U'.`
    );
  }

  return {
    slackBotToken: process.env.SLACK_BOT_TOKEN!,
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET!,
    slackAppToken: process.env.SLACK_APP_TOKEN!,
    notificationChannelId: process.env.NOTIFICATION_CHANNEL_ID!,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID!,
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(
      /\\n/g,
      '\n'
    ),
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    adminUserIds,
    timezone: process.env.TIMEZONE || 'Europe/Zagreb',
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

// Export a singleton instance
export const env = loadEnvironment();
