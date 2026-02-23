import {
  getParkingAssignment,
  runTransaction,
  addParkingHistory,
  addAuditLog,
} from '../utils/firestoreUtils';
import {
  sendForfeitNotification,
  updateDailyNotification,
} from './notificationService';
import { getNextAvailablePeople } from './rotationService';
import { getCurrentDate, fromISODate, addHours, toISODate } from '../utils/dateUtils';
import { now } from '../config/firebase';
import { ERROR_MESSAGES } from '../models/constants';
import type { ParkingAssignment } from '../models/types';

/**
 * Handle a forfeit action with cascade logic
 */
export async function handleForfeit(
  userId: string,
  date: string,
  messageTs: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Use transaction to ensure consistency
    const result = await runTransaction(async (transaction) => {
      const db = transaction.firestore;
      const docRef = db.collection('parkingAssignments').doc(date);
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        return {
          success: false,
          message: ERROR_MESSAGES.NOT_ASSIGNED,
        };
      }

      const assignment = doc.data() as ParkingAssignment;

      // Validate user is assigned
      if (!assignment.assignedUsers.includes(userId)) {
        return {
          success: false,
          message: ERROR_MESSAGES.NOT_ASSIGNED,
        };
      }

      // Validate forfeit window is open
      if (!isForfeitWindowOpen(assignment)) {
        return {
          success: false,
          message: ERROR_MESSAGES.FORFEIT_WINDOW_CLOSED,
        };
      }

      // Remove user from assigned list
      const updatedAssignedUsers = assignment.assignedUsers.filter(
        (id) => id !== userId
      );

      // Add to forfeited list
      const updatedForfeitedUsers = [...assignment.forfeitedUsers, userId];

      // Update assignment
      transaction.update(docRef, {
        assignedUsers: updatedAssignedUsers,
        forfeitedUsers: updatedForfeitedUsers,
      });

      return {
        success: true,
        message: 'Forfeit successful',
        updatedAssignedUsers,
        updatedForfeitedUsers,
      };
    });

    if (!result.success) {
      return result;
    }

    // Find next eligible person
    const assignmentDate = fromISODate(date);
    const excludedUserIds = [
      ...(result.updatedAssignedUsers || []),
      ...(result.updatedForfeitedUsers || []),
    ];

    const nextPeople = await getNextAvailablePeople(
      assignmentDate,
      1,
      excludedUserIds
    );

    // Update assignment with next person (if available)
    const updatedAssignment = await getParkingAssignment(date);
    if (!updatedAssignment) {
      throw new Error('Assignment not found after transaction');
    }

    if (nextPeople.length > 0) {
      const nextPerson = nextPeople[0];
      updatedAssignment.assignedUsers.push(nextPerson);

      // Update in database
      await runTransaction(async (transaction) => {
        const db = transaction.firestore;
        const docRef = db.collection('parkingAssignments').doc(date);
        transaction.update(docRef, {
          assignedUsers: updatedAssignment.assignedUsers,
        });
      });

      // Notify next person
      await sendForfeitNotification(nextPerson, date, messageTs);

      console.log(
        `User ${userId} forfeited spot for ${date}, assigned to ${nextPerson}`
      );
    } else {
      console.log(
        `User ${userId} forfeited spot for ${date}, no replacement available`
      );
    }

    // Update the message
    if (updatedAssignment.notificationMessageTs) {
      await updateDailyNotification(
        updatedAssignment.notificationMessageTs,
        updatedAssignment
      );
    }

    // Record parking history
    await addParkingHistory({
      userId,
      date,
      parked: false,
      forfeited: true,
      weekStartDate: updatedAssignment.weekStartDate,
      createdAt: now(),
    });

    // Add audit log
    await addAuditLog('FORFEIT', userId, {
      date,
      nextPerson: nextPeople.length > 0 ? nextPeople[0] : null,
    });

    return {
      success: true,
      message: 'Your parking spot has been forfeited.',
    };
  } catch (error) {
    console.error('Error handling forfeit:', error);
    return {
      success: false,
      message: ERROR_MESSAGES.DATABASE_ERROR,
    };
  }
}

/**
 * Check if forfeit window is still open
 */
export function isForfeitWindowOpen(assignment: ParkingAssignment): boolean {
  if (assignment.isFinalized) {
    return false;
  }

  // Check if notification was sent
  if (!assignment.notificationSentAt) {
    return false;
  }

  const now = getCurrentDate();
  const notificationTime = assignment.notificationSentAt.toDate();
  const windowCloseTime = addHours(notificationTime, 2); // 2 hour window

  return now < windowCloseTime;
}

/**
 * Get next eligible person for parking
 * (not already assigned, not on vacation, not forfeited)
 */
export async function findNextEligiblePerson(
  date: string,
  excludeUserIds: string[]
): Promise<string | null> {
  const assignmentDate = fromISODate(date);
  const nextPeople = await getNextAvailablePeople(
    assignmentDate,
    1,
    excludeUserIds
  );

  return nextPeople.length > 0 ? nextPeople[0] : null;
}

/**
 * Finalize an assignment (close forfeit window)
 */
export async function finalizeAssignment(date: string): Promise<void> {
  const assignment = await getParkingAssignment(date);
  if (!assignment) {
    throw new Error(`Assignment not found for ${date}`);
  }

  if (assignment.isFinalized) {
    console.log(`Assignment already finalized for ${date}`);
    return;
  }

  // Update assignment
  await runTransaction(async (transaction) => {
    const db = transaction.firestore;
    const docRef = db.collection('parkingAssignments').doc(date);
    transaction.update(docRef, {
      isFinalized: true,
      finalizedAt: now(),
    });
  });

  // Record parking history for all assigned users
  for (const userId of assignment.assignedUsers) {
    // Only add if not already forfeited
    if (!assignment.forfeitedUsers.includes(userId)) {
      await addParkingHistory({
        userId,
        date,
        parked: true,
        forfeited: false,
        weekStartDate: assignment.weekStartDate,
        createdAt: now(),
      });
    }
  }

  console.log(`Assignment finalized for ${date}`);
}

/**
 * Check if forfeit window is currently open for today's notification
 */
export async function isTodaysForfeitWindowOpen(): Promise<boolean> {
  const today = getCurrentDate();
  const todayStr = toISODate(today);

  const assignment = await getParkingAssignment(todayStr);
  if (!assignment) {
    return false;
  }

  return isForfeitWindowOpen(assignment);
}
