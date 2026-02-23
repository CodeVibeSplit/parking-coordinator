import { initializeFirebase, now } from '../src/config/firebase';
import { COLLECTIONS, SINGLETON_IDS, DEFAULT_AVAILABLE_SPOTS, DEFAULT_FORFEIT_WINDOW_HOURS, NOTIFICATION_TIME } from '../src/models/constants';
import { getCurrentWeekStart, toISODate } from '../src/utils/dateUtils';
import { env } from '../src/config/environment';
import type { Config, RotationState } from '../src/models/types';

/**
 * Initialize Firestore with default data
 */
async function initialize() {
  console.log('Starting Firestore initialization...');

  try {
    const db = initializeFirebase();

    // Team members in rotation order (from requirements)
    const teamMembers = [
      'U06MU0GR1S8',
      'UQ6BDGF8W',
      'UP2A93ZRC',
      'U07MG81CV9D',
      'U01EHTVEGQG',
    ];

    // Create config document
    console.log('Creating config document...');
    const configData: Config = {
      id: SINGLETON_IDS.CONFIG,
      teamMembers,
      rotationOrder: teamMembers,
      availableSpots: DEFAULT_AVAILABLE_SPOTS,
      dailyNotificationTime: NOTIFICATION_TIME,
      forfeitWindowHours: DEFAULT_FORFEIT_WINDOW_HOURS,
      adminUserIds: env.adminUserIds,
      createdAt: now(),
      updatedAt: now(),
    };

    await db
      .collection(COLLECTIONS.CONFIG)
      .doc(SINGLETON_IDS.CONFIG)
      .set(configData);

    console.log('Config document created successfully');

    // Create initial rotation state
    console.log('Creating initial rotation state...');
    const weekStart = getCurrentWeekStart();
    const rotationStateData: RotationState = {
      id: SINGLETON_IDS.ROTATION_STATE,
      weekStartDate: toISODate(weekStart),
      currentWeekOrder: teamMembers, // Initially all members are active
      currentRotationIndex: 0, // Start from the beginning
      lastAssignmentDate: '', // No assignments yet
      updatedAt: now(),
    };

    await db
      .collection(COLLECTIONS.ROTATION_STATE)
      .doc(SINGLETON_IDS.ROTATION_STATE)
      .set(rotationStateData);

    console.log('Rotation state created successfully');

    console.log('\n✅ Firestore initialization complete!');
    console.log('\nInitialized data:');
    console.log(`- Team members: ${teamMembers.length}`);
    console.log(`- Available spots: ${DEFAULT_AVAILABLE_SPOTS}`);
    console.log(`- Notification time: ${NOTIFICATION_TIME}`);
    console.log(`- Forfeit window: ${DEFAULT_FORFEIT_WINDOW_HOURS} hours`);
    console.log(`- Week start date: ${toISODate(weekStart)}`);
    console.log(`- Admin users: ${env.adminUserIds.join(', ')}`);

    console.log('\n📝 Next steps:');
    console.log('1. Set up your .env file with all required variables');
    console.log('2. Configure your Slack app with the correct OAuth scopes');
    console.log('3. Run "npm run dev" to start the app');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing Firestore:', error);
    process.exit(1);
  }
}

// Run initialization
initialize();
