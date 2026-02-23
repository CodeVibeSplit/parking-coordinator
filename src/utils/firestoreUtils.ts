import { getFirestore, now } from '../config/firebase';
import { COLLECTIONS, SINGLETON_IDS } from '../models/constants';
import type {
  Config,
  RotationState,
  Vacation,
  ParkingAssignment,
  ParkingHistory,
  AuditLog,
  AuditAction,
} from '../models/types';

/**
 * Get the config document
 */
export async function getConfig(): Promise<Config | null> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTIONS.CONFIG).doc(SINGLETON_IDS.CONFIG);
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as Config;
}

/**
 * Update the config document
 */
export async function updateConfig(updates: Partial<Config>): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTIONS.CONFIG).doc(SINGLETON_IDS.CONFIG);

  await docRef.update({
    ...updates,
    updatedAt: now(),
  });
}

/**
 * Get the rotation state document
 */
export async function getRotationState(): Promise<RotationState | null> {
  const db = getFirestore();
  const docRef = db
    .collection(COLLECTIONS.ROTATION_STATE)
    .doc(SINGLETON_IDS.ROTATION_STATE);
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as RotationState;
}

/**
 * Update the rotation state document
 */
export async function updateRotationState(
  updates: Partial<RotationState>
): Promise<void> {
  const db = getFirestore();
  const docRef = db
    .collection(COLLECTIONS.ROTATION_STATE)
    .doc(SINGLETON_IDS.ROTATION_STATE);

  await docRef.update({
    ...updates,
    updatedAt: now(),
  });
}

/**
 * Set the rotation state document (creates if doesn't exist)
 */
export async function setRotationState(state: RotationState): Promise<void> {
  const db = getFirestore();
  const docRef = db
    .collection(COLLECTIONS.ROTATION_STATE)
    .doc(SINGLETON_IDS.ROTATION_STATE);

  await docRef.set(state);
}

/**
 * Get all vacations that overlap with a date range
 */
export async function getVacationsInRange(
  startDate: string,
  endDate: string
): Promise<Vacation[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.VACATIONS)
    .where('endDate', '>=', startDate)
    .where('startDate', '<=', endDate)
    .get();

  return snapshot.docs.map((doc) => doc.data() as Vacation);
}

/**
 * Get all vacations for a specific user
 */
export async function getUserVacations(userId: string): Promise<Vacation[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.VACATIONS)
    .where('userId', '==', userId)
    .orderBy('startDate', 'asc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as Vacation);
}

/**
 * Add a vacation
 */
export async function addVacation(vacation: Vacation): Promise<string> {
  const db = getFirestore();
  const docRef = await db.collection(COLLECTIONS.VACATIONS).add(vacation);
  return docRef.id;
}

/**
 * Remove a vacation by ID
 */
export async function removeVacation(vacationId: string): Promise<void> {
  const db = getFirestore();
  await db.collection(COLLECTIONS.VACATIONS).doc(vacationId).delete();
}

/**
 * Get a parking assignment by date
 */
export async function getParkingAssignment(
  date: string
): Promise<ParkingAssignment | null> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTIONS.PARKING_ASSIGNMENTS).doc(date);
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as ParkingAssignment;
}

/**
 * Set a parking assignment (creates or updates)
 */
export async function setParkingAssignment(
  assignment: ParkingAssignment
): Promise<void> {
  const db = getFirestore();
  await db
    .collection(COLLECTIONS.PARKING_ASSIGNMENTS)
    .doc(assignment.id)
    .set(assignment);
}

/**
 * Update a parking assignment
 */
export async function updateParkingAssignment(
  date: string,
  updates: Partial<ParkingAssignment>
): Promise<void> {
  const db = getFirestore();
  await db
    .collection(COLLECTIONS.PARKING_ASSIGNMENTS)
    .doc(date)
    .update(updates);
}

/**
 * Get parking assignments for a date range
 */
export async function getParkingAssignmentsInRange(
  startDate: string,
  endDate: string
): Promise<ParkingAssignment[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.PARKING_ASSIGNMENTS)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'asc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as ParkingAssignment);
}

/**
 * Add a parking history record
 */
export async function addParkingHistory(
  history: Omit<ParkingHistory, 'id'>
): Promise<string> {
  const db = getFirestore();
  const docRef = await db.collection(COLLECTIONS.PARKING_HISTORY).add(history);
  return docRef.id;
}

/**
 * Get parking history for a user
 */
export async function getUserParkingHistory(
  userId: string,
  limit?: number
): Promise<ParkingHistory[]> {
  const db = getFirestore();
  let query = db
    .collection(COLLECTIONS.PARKING_HISTORY)
    .where('userId', '==', userId)
    .orderBy('date', 'desc');

  if (limit) {
    query = query.limit(limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ParkingHistory[];
}

/**
 * Get all parking history
 */
export async function getAllParkingHistory(): Promise<ParkingHistory[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.PARKING_HISTORY)
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ParkingHistory[];
}

/**
 * Add an audit log entry
 */
export async function addAuditLog(
  action: AuditAction,
  userId: string,
  details: Record<string, unknown>,
  affectedDate?: string
): Promise<void> {
  const db = getFirestore();
  const log: Omit<AuditLog, 'id'> = {
    timestamp: now(),
    action,
    userId,
    details,
    affectedDate,
  };

  await db.collection(COLLECTIONS.AUDIT_LOG).add(log);
}

/**
 * Get audit logs for a specific date
 */
export async function getAuditLogsForDate(
  date: string
): Promise<AuditLog[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.AUDIT_LOG)
    .where('affectedDate', '==', date)
    .orderBy('timestamp', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as AuditLog[];
}

/**
 * Run a Firestore transaction
 */
export async function runTransaction<T>(
  updateFunction: (transaction: FirebaseFirestore.Transaction) => Promise<T>
): Promise<T> {
  const db = getFirestore();
  return db.runTransaction(updateFunction);
}
