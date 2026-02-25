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
  User,
  PointsHistoryEntry,
  WeeklySchedule,
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
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as Vacation)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
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
  const snapshot = await db
    .collection(COLLECTIONS.PARKING_HISTORY)
    .where('userId', '==', userId)
    .get();

  const results = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as ParkingHistory)
    .sort((a, b) => b.date.localeCompare(a.date));

  return limit ? results.slice(0, limit) : results;
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

/**
 * Get a user document by userId
 */
export async function getUser(userId: string): Promise<User | null> {
  const db = getFirestore();
  const doc = await db.collection(COLLECTIONS.USERS).doc(userId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as User;
}

/**
 * Set a user document (creates or replaces)
 */
export async function setUser(user: User): Promise<void> {
  const db = getFirestore();
  await db.collection(COLLECTIONS.USERS).doc(user.userId).set(user);
}

/**
 * Atomically increment a user's points by delta (positive or negative).
 * Creates the document with points = delta if it doesn't exist.
 */
export async function updateUserPoints(userId: string, delta: number): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTIONS.USERS).doc(userId);

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);

    if (!doc.exists) {
      transaction.set(docRef, { userId, points: delta, isActive: true });
    } else {
      const current = (doc.data() as User).points ?? 0;
      transaction.update(docRef, { points: current + delta });
    }
  });
}

/**
 * Get all finalized parking assignments where the user was an original primary
 */
export async function getUserPrimaryAssignments(
  userId: string
): Promise<ParkingAssignment[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.PARKING_ASSIGNMENTS)
    .where('originalPrimaryUsers', 'array-contains', userId)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as ParkingAssignment)
    .filter((a) => a.isFinalized);
}

/**
 * Add a points history entry
 */
export async function addPointsHistoryEntry(
  entry: Omit<PointsHistoryEntry, 'id'>
): Promise<void> {
  const db = getFirestore();
  await db.collection(COLLECTIONS.POINTS_HISTORY).add(entry);
}

/**
 * Get points history for a user, ordered by timestamp descending
 */
export async function getUserPointsHistory(
  userId: string,
  limit?: number
): Promise<PointsHistoryEntry[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.POINTS_HISTORY)
    .where('userId', '==', userId)
    .get();

  const results = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as PointsHistoryEntry)
    .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

  return limit ? results.slice(0, limit) : results;
}

/**
 * Update specific fields on a user document
 */
export async function updateUser(userId: string, updates: Partial<User>): Promise<void> {
  const db = getFirestore();
  await db.collection(COLLECTIONS.USERS).doc(userId).update(updates);
}

/**
 * Get a weekly schedule document by week start date (Monday ISO date)
 */
export async function getWeeklySchedule(weekStartDate: string): Promise<WeeklySchedule | null> {
  const db = getFirestore();
  const doc = await db.collection(COLLECTIONS.WEEKLY_SCHEDULE).doc(weekStartDate).get();
  if (!doc.exists) return null;
  return doc.data() as WeeklySchedule;
}

/**
 * Create or overwrite a weekly schedule document
 */
export async function setWeeklySchedule(schedule: WeeklySchedule): Promise<void> {
  const db = getFirestore();
  await db.collection(COLLECTIONS.WEEKLY_SCHEDULE).doc(schedule.weekStartDate).set(schedule);
}

/**
 * Get all active users
 */
export async function getAllActiveUsers(): Promise<User[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.USERS)
    .where('isActive', '==', true)
    .get();

  return snapshot.docs.map((doc) => doc.data() as User);
}
