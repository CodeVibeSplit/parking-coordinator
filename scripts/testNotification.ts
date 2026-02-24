import { initializeFirebase } from '../src/config/firebase';
import { initializeSlack } from '../src/config/slack';
import { triggerDailyNotification } from '../src/services/schedulerService';
import { env } from '../src/config/environment';

/**
 * Test script to manually trigger daily notification
 */
async function testNotification() {
  console.log('Testing daily notification...\n');

  try {
    // Initialize Firebase
    console.log('Initializing Firebase...');
    initializeFirebase();

    // Initialize Slack
    console.log('Initializing Slack...');
    initializeSlack();

    console.log(`Notification will be sent to channel: ${env.notificationChannelId}\n`);

    // Trigger notification (force=true bypasses the duplicate-check guard)
    console.log('Triggering daily notification...');
    await triggerDailyNotification(true);

    console.log('\n✅ Notification sent successfully!');
    console.log('Check your Slack channel for the parking assignment message.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testNotification();
