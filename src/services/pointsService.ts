import { getUser, updateUserPoints, addAuditLog, addPointsHistoryEntry } from '../utils/firestoreUtils';
import { now } from '../config/firebase';
import { getConfig } from '../utils/firestoreUtils';
import { getUsersOnVacation } from './vacationService';
import { fromISODate } from '../utils/dateUtils';

/**
 * Award (or deduct) points for a user and log the action.
 */
export async function awardPoints(
  userId: string,
  delta: number,
  reason: string,
  affectedDate?: string
): Promise<void> {
  const user = await getUser(userId);
  const currentPoints = user?.points ?? 0;
  const newTotal = currentPoints + delta;

  await updateUserPoints(userId, delta);

  await addPointsHistoryEntry({
    userId,
    delta,
    reason,
    newTotal,
    affectedDate,
    timestamp: now(),
  });

  await addAuditLog('POINTS_AWARDED', userId, {
    delta,
    reason,
  });

  console.log(`Points awarded: user=${userId} delta=${delta} reason=${reason}`);
}

/**
 * Get the ordered secondary list for a given parking date.
 * Returns users sorted by points descending, then userId ascending.
 * Excludes users on vacation on that date and users in excludeUserIds.
 *
 * Returns an array of { userId, points } objects.
 */
export async function getSecondaryList(
  date: string,
  excludeUserIds: string[]
): Promise<Array<{ userId: string; points: number }>> {
  const config = await getConfig();
  if (!config) {
    return [];
  }

  const parkingDate = fromISODate(date);
  const usersOnVacation = await getUsersOnVacation(parkingDate);
  const vacationSet = new Set(usersOnVacation);
  const excludeSet = new Set(excludeUserIds);

  // Filter to eligible team members
  const eligibleUserIds = config.teamMembers.filter(
    (userId) => !vacationSet.has(userId) && !excludeSet.has(userId)
  );

  // Fetch points for each eligible user
  const usersWithPoints: Array<{ userId: string; points: number }> = await Promise.all(
    eligibleUserIds.map(async (userId) => {
      const user = await getUser(userId);
      return { userId, points: user?.points ?? 0 };
    })
  );

  // Sort by points descending, then userId ascending for tie-breaking
  usersWithPoints.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    return a.userId.localeCompare(b.userId);
  });

  return usersWithPoints;
}
