import * as admin from 'firebase-admin';
import { env } from './environment';

let firestore: admin.firestore.Firestore | null = null;

/**
 * Initializes Firebase Admin SDK
 */
export function initializeFirebase(): admin.firestore.Firestore {
  if (firestore) {
    return firestore;
  }

  try {
    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.firebaseProjectId,
        privateKey: env.firebasePrivateKey,
        clientEmail: env.firebaseClientEmail,
      }),
      projectId: env.firebaseProjectId,
    });

    firestore = admin.firestore();

    // Configure Firestore settings
    firestore.settings({
      ignoreUndefinedProperties: true,
    });

    console.log('Firebase initialized successfully');
    return firestore;
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    throw error;
  }
}

/**
 * Gets the Firestore instance
 */
export function getFirestore(): admin.firestore.Firestore {
  if (!firestore) {
    return initializeFirebase();
  }
  return firestore;
}

/**
 * Gets current timestamp
 */
export function now(): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.now();
}

/**
 * Converts Date to Firestore Timestamp
 */
export function toTimestamp(date: Date): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(date);
}

/**
 * Converts Firestore Timestamp to Date
 */
export function fromTimestamp(timestamp: admin.firestore.Timestamp): Date {
  return timestamp.toDate();
}
