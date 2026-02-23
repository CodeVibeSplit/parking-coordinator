import {
  addVacation as addVacationToDb,
  removeVacation as removeVacationFromDb,
  getUserVacations,
  getVacationsInRange,
  addAuditLog,
} from '../utils/firestoreUtils';
import {
  fromISODate,
  toISODate,
  isDateInRange,
  getWeeksCovered,
} from '../utils/dateUtils';
import { now } from '../config/firebase';
import type { Vacation } from '../models/types';

/**
 * Add a vacation period for a user
 */
export async function addVacation(
  userId: string,
  startDateStr: string,
  endDateStr: string,
  createdBy: string
): Promise<string> {
  const startDate = fromISODate(startDateStr);
  const endDate = fromISODate(endDateStr);

  // Calculate which weeks are covered
  const weeksCovered = getWeeksCovered(startDate, endDate);

  const vacation: Vacation = {
    id: '', // Will be set by Firestore
    userId,
    startDate: startDateStr,
    endDate: endDateStr,
    weeksCovered,
    createdAt: now(),
    createdBy,
  };

  const vacationId = await addVacationToDb(vacation);

  await addAuditLog('VACATION_ADDED', createdBy, {
    userId,
    startDate: startDateStr,
    endDate: endDateStr,
    weeksCovered,
    vacationId,
  });

  console.log(
    `Vacation added for user ${userId}: ${startDateStr} to ${endDateStr}`
  );

  return vacationId;
}

/**
 * Remove a vacation by ID
 */
export async function removeVacation(
  vacationId: string,
  requestingUserId: string
): Promise<void> {
  // Note: We don't check if the vacation exists here,
  // Firestore will just do nothing if it doesn't exist

  await removeVacationFromDb(vacationId);

  await addAuditLog('VACATION_REMOVED', requestingUserId, {
    vacationId,
  });

  console.log(
    `Vacation ${vacationId} removed by user ${requestingUserId}`
  );
}

/**
 * Get all vacations for a specific user
 */
export async function getVacationsForUser(
  userId: string
): Promise<Vacation[]> {
  return await getUserVacations(userId);
}

/**
 * Get all upcoming vacations (starting from today)
 */
export async function getUpcomingVacations(): Promise<Vacation[]> {
  const today = toISODate(new Date());
  const futureDate = toISODate(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  ); // 1 year from now

  return await getVacationsInRange(today, futureDate);
}

/**
 * Get vacations for a specific week
 */
export async function getVacationsForWeek(
  weekStartDate: string
): Promise<Vacation[]> {
  const weekStart = fromISODate(weekStartDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return await getVacationsInRange(weekStartDate, toISODate(weekEnd));
}

/**
 * Check if a user is on vacation on a specific date
 */
export async function isUserOnVacation(
  userId: string,
  date: Date
): Promise<boolean> {
  const dateStr = toISODate(date);
  const vacations = await getVacationsInRange(dateStr, dateStr);

  return vacations.some(
    (v) =>
      v.userId === userId &&
      isDateInRange(date, fromISODate(v.startDate), fromISODate(v.endDate))
  );
}

/**
 * Get users on vacation for a specific date
 */
export async function getUsersOnVacation(date: Date): Promise<string[]> {
  const dateStr = toISODate(date);
  const vacations = await getVacationsInRange(dateStr, dateStr);

  const usersOnVacation = new Set<string>();
  for (const vacation of vacations) {
    if (
      isDateInRange(
        date,
        fromISODate(vacation.startDate),
        fromISODate(vacation.endDate)
      )
    ) {
      usersOnVacation.add(vacation.userId);
    }
  }

  return Array.from(usersOnVacation);
}

/**
 * Check if there are any conflicts with existing vacations
 * (same user, overlapping dates)
 */
export async function checkVacationConflicts(
  userId: string,
  startDateStr: string,
  endDateStr: string
): Promise<Vacation | null> {
  const vacations = await getUserVacations(userId);
  const startDate = fromISODate(startDateStr);
  const endDate = fromISODate(endDateStr);

  for (const vacation of vacations) {
    const existingStart = fromISODate(vacation.startDate);
    const existingEnd = fromISODate(vacation.endDate);

    // Check for any overlap
    const overlaps =
      isDateInRange(startDate, existingStart, existingEnd) ||
      isDateInRange(endDate, existingStart, existingEnd) ||
      isDateInRange(existingStart, startDate, endDate) ||
      isDateInRange(existingEnd, startDate, endDate);

    if (overlaps) {
      return vacation;
    }
  }

  return null;
}
