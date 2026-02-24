import { initializeFirebase } from './config/firebase';
import { initializeSlack, getReceiver } from './config/slack';
import { env } from './config/environment';
import { initializeScheduler } from './services/schedulerService';
import { registerCommandHandlers } from './handlers/commandHandlers';
import { registerActionHandlers } from './handlers/actionHandlers';
import { registerReorderHandlers } from './handlers/reorderHandlers';

/**
 * Main application entry point
 */
async function main() {
  console.log('🚀 Starting Parking Coordinator...');
  console.log(`Environment: ${env.nodeEnv}`);
  console.log(`Timezone: ${env.timezone}`);

  try {
    // Initialize Firebase
    console.log('\n📦 Initializing Firebase...');
    initializeFirebase();

    // Initialize Slack
    console.log('\n💬 Initializing Slack app...');
    const app = initializeSlack();

    // Register handlers
    console.log('\n🔌 Registering handlers...');
    registerCommandHandlers(app);
    registerActionHandlers(app);
    registerReorderHandlers(app);

    // Get the Express app from Slack receiver
    const receiver = getReceiver();
    const expressApp = receiver.app;

    // Health check endpoint
    expressApp.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        timezone: env.timezone,
      });
    });

    // Start Express server (Bolt handles /slack/events automatically)
    const port = env.port;
    receiver.start(port).then(() => {
      console.log(`\n✅ Server is running on port ${port}`);
      console.log(`   Health check: http://localhost:${port}/health`);
      console.log(`   Slack events: http://localhost:${port}/slack/events`);
    });

    // Initialize scheduler
    console.log('\n⏰ Initializing scheduler...');
    initializeScheduler();

    console.log('\n🎉 Parking Coordinator is ready!');
    console.log(`\n📋 Configuration:`);
    console.log(`   - Notification channel: ${env.notificationChannelId}`);
    console.log(`   - Admin users: ${env.adminUserIds.join(', ')}`);
    console.log(`   - Timezone: ${env.timezone}`);
    console.log('\n💡 Available commands:');
    console.log('   /parking-schedule [days] - View upcoming assignments');
    console.log('   /parking-vacation add <start> <end> - Add vacation');
    console.log('   /parking-vacation list - List your vacations');
    console.log('   /parking-vacation remove <id> - Remove vacation');
    console.log('   /parking-stats [user] - View parking statistics');
    console.log('   /parking-admin-override <date> <users...> - Admin override');
    console.log('   /parking-admin-reorder - Admin: Reorder team rotation');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\n🛑 Shutting down gracefully...');
      process.exit(0);
    });
  } catch (error) {
    console.error('\n❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
main();
