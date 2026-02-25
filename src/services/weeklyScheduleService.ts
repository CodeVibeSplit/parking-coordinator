import {
  getAllActiveUsers,
  getAllParkingHistory,
  getConfig,
  getVacationsInRange,
  getWeeklySchedule as getWeeklyScheduleFromDb,
  setWeeklySchedule,
} from '../utils/firestoreUtils';
import { getSecondaryList } from './pointsService';
import {
  fromISODate,
  toISODate,
  getWeekStart,
  addDays,
  getCurrentDate,
  daysDifference,
} from '../utils/dateUtils';
import { now } from '../config/firebase';
import type { WeeklySchedule } from '../models/types';

/**
 * Compute parking ratio for a user.
 * ratio = parkingHistoryCount / daysSinceRegistration
 * Returns 0 if registered less than 1 day ago (new member gets highest priority).
 */
function computeRatio(historyCount: number, registeredAt: Date): number {
  const daysSince = daysDifference(getCurrentDate(), registeredAt);
  if (daysSince === 0) return 0;
  return historyCount / daysSince;
}

/**
 * Fetch all active users with their ratios, sorted ascending (lowest first).
 * Lowest ratio = should be assigned next.
 */
async function getUsersSortedByRatio(): Promise<Array<{ userId: string; ratio: number }>> {
  const [allUsers, allHistory] = await Promise.all([
    getAllActiveUsers(),
    getAllParkingHistory(),
  ]);

  const historyCounts = new Map<string, number>();
  for (const entry of allHistory) {
    historyCounts.set(entry.userId, (historyCounts.get(entry.userId) ?? 0) + 1);
  }

  return allUsers
    .map((user) => ({
      userId: user.userId,
      ratio: computeRatio(
        historyCounts.get(user.userId) ?? 0,
        user.registeredAt.toDate()
      ),
    }))
    .sort((a, b) => a.ratio - b.ratio);
}

/**
 * Return the set of user IDs who are on vacation for the entire week (Mon–Fri).
 */
async function getFullWeekVacationUsers(weekStartDate: string): Promise<Set<string>> {
  const weekStart = fromISODate(weekStartDate);
  const weekFriday = addDays(weekStart, 4);
  const vacations = await getVacationsInRange(weekStartDate, toISODate(weekFriday));

  const absent = new Set<string>();
  for (const v of vacations) {
    const vacStart = fromISODate(v.startDate);
    const vacEnd = fromISODate(v.endDate);
    if (vacStart <= weekStart && vacEnd >= weekFriday) {
      absent.add(v.userId);
    }
  }
  return absent;
}

/**
 * Calculate the primary users for a given week using the ratio algorithm.
 * Excludes users on full-week vacation.
 */
export async function calculateWeeklyPrimaries(weekStartDate: string): Promise<string[]> {
  const config = await getConfig();
  if (!config) throw new Error('Config not found');

  const [sortedUsers, fullWeekVacation] = await Promise.all([
    getUsersSortedByRatio(),
    getFullWeekVacationUsers(weekStartDate),
  ]);

  return sortedUsers
    .filter((u) => !fullWeekVacation.has(u.userId))
    .slice(0, config.availableSpots)
    .map((u) => u.userId);
}

/**
 * Read the weekly schedule for a given week start date.
 */
export async function getWeeklySchedule(weekStartDate: string): Promise<WeeklySchedule | null> {
  return getWeeklyScheduleFromDb(weekStartDate);
}

/**
 * Persist a new weekly schedule to Firestore.
 */
export async function createWeeklySchedule(
  weekStartDate: string,
  primaryUserIds: string[],
  announcedBy = 'system'
): Promise<void> {
  await setWeeklySchedule({
    weekStartDate,
    primaryUserIds,
    announcedAt: now(),
    announcedBy,
  });
}

/**
 * Get the final list of assignees for a specific date.
 * Uses the week's primary users as the base, then:
 *   - Removes primaries on vacation that day
 *   - Fills each gap with the next lowest-ratio available user
 */
export async function getDailyAssignees(dateStr: string): Promise<string[]> {
  const config = await getConfig();
  if (!config) throw new Error('Config not found');

  const weekStartStr = toISODate(getWeekStart(fromISODate(dateStr)));

  // Load or generate weekly schedule (handles missed Friday job)
  let schedule = await getWeeklyScheduleFromDb(weekStartStr);
  if (!schedule) {
    const primaryUserIds = await calculateWeeklyPrimaries(weekStartStr);
    await createWeeklySchedule(weekStartStr, primaryUserIds, 'system');
    schedule = {
      weekStartDate: weekStartStr,
      primaryUserIds,
      announcedAt: now(),
      announcedBy: 'system',
    };
    console.log(`getDailyAssignees: generated missing weeklySchedule for ${weekStartStr}`);
  }

  // Get vacation users for this specific day
  const dayVacations = await getVacationsInRange(dateStr, dateStr);
  const vacationSet = new Set(dayVacations.map((v) => v.userId));

  // Start with primaries not on vacation today
  const assignees = schedule.primaryUserIds.filter((u) => !vacationSet.has(u));

  // Fill vacation gaps using the secondary list (points-based, same as forfeit replacements)
  if (assignees.length < config.availableSpots) {
    const secondary = await getSecondaryList(dateStr, assignees);
    for (const { userId } of secondary) {
      if (assignees.length >= config.availableSpots) break;
      assignees.push(userId);
    }
  }

  return assignees;
}
