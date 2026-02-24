import {
  getConfig,
  getRotationState,
  updateRotationState,
  setRotationState,
  getVacationsInRange,
  addAuditLog,
} from '../utils/firestoreUtils';
import {
  toISODate,
  getWeekStart,
  getCurrentWeekStart,
  fromISODate,
  isWeekday,
} from '../utils/dateUtils';
import { now } from '../config/firebase';
import type { RotationState } from '../models/types';

/**
 * Get parking assignments for a specific date
 */
export async function getAssignmentsForDate(date: Date): Promise<string[]> {
  const config = await getConfig();
  if (!config) {
    throw new Error('Configuration not found');
  }

  const rotationState = await getRotationState();
  if (!rotationState) {
    throw new Error('Rotation state not found');
  }

  // Check if date is a weekday
  if (!isWeekday(date)) {
    return [];
  }

  // Calculate assignments
  return await calculateNextAssignments(date, config.availableSpots);
}

/**
 * Calculate who should park on a specific date, considering vacations
 */
export async function calculateNextAssignments(
  date: Date,
  count: number
): Promise<string[]> {
  const config = await getConfig();
  if (!config) {
    throw new Error('Configuration not found');
  }

  const rotationState = await getRotationState();
  if (!rotationState) {
    throw new Error('Rotation state not found');
  }

  const dateStr = toISODate(date);

  // Get vacations for this specific date
  const vacations = await getVacationsInRange(dateStr, dateStr);
  const vacationUserIds = vacations.map((v) => v.userId);

  // Start from current rotation index
  let currentIndex = rotationState.currentRotationIndex;
  const assigned: string[] = [];
  let attempts = 0;
  const maxAttempts = config.rotationOrder.length * 2; // Prevent infinite loops

  // Assign spots to available people
  while (assigned.length < count && attempts < maxAttempts) {
    const userId = config.rotationOrder[currentIndex % config.rotationOrder.length];

    // Check if user is on vacation
    if (!vacationUserIds.includes(userId)) {
      assigned.push(userId);
    }

    currentIndex++;
    attempts++;
  }

  return assigned;
}

/**
 * Advance rotation after a day's assignments are finalized
 */
export async function advanceRotation(parkingCount: number): Promise<void> {
  const rotationState = await getRotationState();
  if (!rotationState) {
    throw new Error('Rotation state not found');
  }

  const config = await getConfig();
  if (!config) {
    throw new Error('Configuration not found');
  }

  // Advance the rotation index by the number of spots assigned
  const newIndex =
    (rotationState.currentRotationIndex + parkingCount) %
    config.rotationOrder.length;

  await updateRotationState({
    currentRotationIndex: newIndex,
    lastAssignmentDate: toISODate(new Date()),
  });

  await addAuditLog(
    'ROTATION_ADVANCED',
    'system',
    {
      previousIndex: rotationState.currentRotationIndex,
      newIndex,
      parkingCount,
    }
  );

  console.log(
    `Rotation advanced: index ${rotationState.currentRotationIndex} → ${newIndex}`
  );
}

/**
 * Check and reset weekly rotation if it's a new week
 */
export async function checkAndResetWeeklyRotation(
  date: Date
): Promise<void> {
  const rotationState = await getRotationState();
  if (!rotationState) {
    throw new Error('Rotation state not found');
  }

  const weekStart = getWeekStart(date);
  const weekStartStr = toISODate(weekStart);

  // Check if we're in a new week
  if (weekStartStr !== rotationState.weekStartDate) {
    console.log(
      `New week detected: ${rotationState.weekStartDate} → ${weekStartStr}`
    );

    // Get active members for the new week (excluding those on vacation)
    const activeMembers = await getActiveMembers(weekStartStr);

    await updateRotationState({
      weekStartDate: weekStartStr,
      currentWeekOrder: activeMembers,
    });

    await addAuditLog(
      'WEEK_RESET',
      'system',
      {
        previousWeekStart: rotationState.weekStartDate,
        newWeekStart: weekStartStr,
        activeMembers,
      }
    );

    console.log(`Week reset complete. Active members: ${activeMembers.length}`);
  }
}

/**
 * Get active members for a specific week (excluding those on vacation)
 */
export async function getActiveMembers(weekStartDate: string): Promise<string[]> {
  const config = await getConfig();
  if (!config) {
    throw new Error('Configuration not found');
  }

  // Get end of week (Sunday)
  const weekStart = fromISODate(weekStartDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Get vacations that overlap with this week
  const vacations = await getVacationsInRange(
    weekStartDate,
    toISODate(weekEnd)
  );

  // Find users who are on vacation for the entire week
  const vacationUserIds = new Set<string>();
  for (const vacation of vacations) {
    // Check if vacation covers the whole week
    const vacStart = fromISODate(vacation.startDate);
    const vacEnd = fromISODate(vacation.endDate);

    if (vacStart <= weekStart && vacEnd >= weekEnd) {
      vacationUserIds.add(vacation.userId);
    }
  }

  // Filter out users on vacation
  return config.rotationOrder.filter(
    (userId) => !vacationUserIds.has(userId)
  );
}

/**
 * Get the next N people in rotation who are available
 */
export async function getNextAvailablePeople(
  date: Date,
  count: number,
  excludeUserIds: string[] = []
): Promise<string[]> {
  const config = await getConfig();
  if (!config) {
    throw new Error('Configuration not found');
  }

  const rotationState = await getRotationState();
  if (!rotationState) {
    throw new Error('Rotation state not found');
  }

  const dateStr = toISODate(date);

  // Get vacations for this date
  const vacations = await getVacationsInRange(dateStr, dateStr);
  const vacationUserIds = vacations.map((v) => v.userId);

  // Combine excluded users
  const excludedSet = new Set([...excludeUserIds, ...vacationUserIds]);

  // Find available people
  let currentIndex = rotationState.currentRotationIndex;
  const available: string[] = [];
  let attempts = 0;
  const maxAttempts = config.rotationOrder.length * 2;

  while (available.length < count && attempts < maxAttempts) {
    const userId = config.rotationOrder[currentIndex % config.rotationOrder.length];

    if (!excludedSet.has(userId)) {
      available.push(userId);
    }

    currentIndex++;
    attempts++;
  }

  return available;
}

/**
 * Initialize rotation state (for first run)
 */
export async function initializeRotationState(): Promise<void> {
  const config = await getConfig();
  if (!config) {
    throw new Error('Configuration not found');
  }

  const weekStart = getCurrentWeekStart();
  const weekStartStr = toISODate(weekStart);

  const initialState: RotationState = {
    id: 'current',
    weekStartDate: weekStartStr,
    currentWeekOrder: config.rotationOrder,
    currentRotationIndex: 0,
    lastAssignmentDate: '',
    updatedAt: now(),
  };

  await setRotationState(initialState);
  console.log('Rotation state initialized');
}

/**
 * Manually set rotation index (admin function)
 */
export async function setRotationIndex(
  newIndex: number,
  userId: string
): Promise<void> {
  const config = await getConfig();
  if (!config) {
    throw new Error('Configuration not found');
  }

  if (newIndex < 0 || newIndex >= config.rotationOrder.length) {
    throw new Error('Invalid rotation index');
  }

  const rotationState = await getRotationState();
  if (!rotationState) {
    throw new Error('Rotation state not found');
  }

  await updateRotationState({
    currentRotationIndex: newIndex,
  });

  await addAuditLog(
    'ROTATION_OVERRIDE',
    userId,
    {
      previousIndex: rotationState.currentRotationIndex,
      newIndex,
    }
  );

  console.log(`Rotation index manually set to ${newIndex} by ${userId}`);
}
