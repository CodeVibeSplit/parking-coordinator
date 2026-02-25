import {
  getParkingAssignment,
  runTransaction,
  addParkingHistory,
  addAuditLog,
} from '../utils/firestoreUtils';
import { getFirestore } from '../config/firebase';
import {
  sendForfeitNotification,
  updateDailyNotification,
} from './notificationService';
import { getNextAvailablePeople } from './rotationService';
import { awardPoints } from './pointsService';
import { getCurrentDate, fromISODate, addHours, toISODate } from '../utils/dateUtils';
import { now } from '../config/firebase';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../models/constants';
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
      const db = getFirestore();
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

    // Award +1 if user is an original primary
    const preAwardAssignment = await getParkingAssignment(date);
    const originalPrimaryUsers = preAwardAssignment?.originalPrimaryUsers ?? [];
    if (originalPrimaryUsers.includes(userId)) {
      await awardPoints(userId, 1, 'forfeit_before_deadline', date);
    }

    // Find next eligible person using secondaryList
    const currentAssigned = result.updatedAssignedUsers || [];
    const currentForfeited = result.updatedForfeitedUsers || [];
    const secondaryList = preAwardAssignment?.secondaryList ?? [];

    let nextPerson: string | null = null;
    for (const candidateId of secondaryList) {
      if (!currentAssigned.includes(candidateId) && !currentForfeited.includes(candidateId)) {
        nextPerson = candidateId;
        break;
      }
    }

    // Fall back to rotation-based lookup if secondaryList is empty or exhausted
    if (!nextPerson) {
      const assignmentDate = fromISODate(date);
      const excludedUserIds = [...currentAssigned, ...currentForfeited];
      const nextPeople = await getNextAvailablePeople(assignmentDate, 1, excludedUserIds);
      nextPerson = nextPeople.length > 0 ? nextPeople[0] : null;
    }

    // Update assignment with next person (if available)
    const updatedAssignment = await getParkingAssignment(date);
    if (!updatedAssignment) {
      throw new Error('Assignment not found after transaction');
    }

    if (nextPerson) {
      updatedAssignment.assignedUsers.push(nextPerson);

      // Update in database
      await runTransaction(async (transaction) => {
        const db = getFirestore();
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
      nextPerson,
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
 * Handle a confirm action — add user to confirmedUsers list
 */
export async function handleConfirm(
  userId: string,
  date: string,
  _messageTs: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await runTransaction(async (transaction) => {
      const db = getFirestore();
      const docRef = db.collection('parkingAssignments').doc(date);
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        return { success: false, message: ERROR_MESSAGES.NOT_ASSIGNED };
      }

      const assignment = doc.data() as ParkingAssignment;

      if (!assignment.assignedUsers.includes(userId)) {
        return { success: false, message: ERROR_MESSAGES.NOT_ASSIGNED };
      }

      if (!isForfeitWindowOpen(assignment)) {
        return { success: false, message: ERROR_MESSAGES.FORFEIT_WINDOW_CLOSED };
      }

      const confirmedUsers = assignment.confirmedUsers ?? [];
      if (confirmedUsers.includes(userId)) {
        return { success: false, message: ERROR_MESSAGES.ALREADY_CONFIRMED };
      }

      transaction.update(docRef, {
        confirmedUsers: [...confirmedUsers, userId],
      });

      return { success: true, message: SUCCESS_MESSAGES.CONFIRM_SUCCESS };
    });

    if (!result.success) {
      return result;
    }

    // Award +1 if user is an original primary
    const updatedAssignment = await getParkingAssignment(date);
    const originalPrimaryUsers = updatedAssignment?.originalPrimaryUsers ?? [];
    if (originalPrimaryUsers.includes(userId)) {
      await awardPoints(userId, 1, 'confirm_before_deadline', date);
    }

    // Refresh the channel message
    if (updatedAssignment?.notificationMessageTs) {
      await updateDailyNotification(
        updatedAssignment.notificationMessageTs,
        updatedAssignment
      );
    }

    return { success: true, message: SUCCESS_MESSAGES.CONFIRM_SUCCESS };
  } catch (error) {
    console.error('Error handling confirm:', error);
    return { success: false, message: ERROR_MESSAGES.DATABASE_ERROR };
  }
}

/**
 * Auto-forfeit all assigned users who have not confirmed by window close (18:00).
 * Called by closeForfeitWindowJob before finalizing.
 * Returns the list of user IDs that were auto-forfeited.
 */
export async function autoForfeitUnconfirmedUsers(date: string): Promise<string[]> {
  const assignment = await getParkingAssignment(date);
  if (!assignment) {
    console.log(`autoForfeitUnconfirmedUsers: no assignment for ${date}`);
    return [];
  }

  const confirmedUsers = assignment.confirmedUsers ?? [];
  const unconfirmed = assignment.assignedUsers.filter(
    (u) => !confirmedUsers.includes(u)
  );

  if (unconfirmed.length === 0) {
    console.log(`autoForfeitUnconfirmedUsers: all users confirmed for ${date}`);
    return [];
  }

  const autoForfeited: string[] = [];

  for (const userId of unconfirmed) {
    try {
      // Transaction: remove from assignedUsers, add to forfeitedUsers
      const txResult = await runTransaction(async (transaction) => {
        const db = getFirestore();
        const docRef = db.collection('parkingAssignments').doc(date);
        const doc = await transaction.get(docRef);
        if (!doc.exists) return { success: false };

        const current = doc.data() as ParkingAssignment;
        const updatedAssignedUsers = current.assignedUsers.filter((id) => id !== userId);
        const updatedForfeitedUsers = [...current.forfeitedUsers, userId];

        transaction.update(docRef, {
          assignedUsers: updatedAssignedUsers,
          forfeitedUsers: updatedForfeitedUsers,
        });

        return {
          success: true,
          updatedAssignedUsers,
          updatedForfeitedUsers,
        };
      });

      if (!txResult.success) continue;

      // Find replacement
      const assignmentDate = fromISODate(date);
      const excludedUserIds = [
        ...(txResult.updatedAssignedUsers || []),
        ...(txResult.updatedForfeitedUsers || []),
      ];

      const nextPeople = await getNextAvailablePeople(assignmentDate, 1, excludedUserIds);

      // Add replacement to assignment
      if (nextPeople.length > 0) {
        const nextPerson = nextPeople[0];
        const current = await getParkingAssignment(date);
        if (current) {
          await runTransaction(async (transaction) => {
            const db = getFirestore();
            const docRef = db.collection('parkingAssignments').doc(date);
            transaction.update(docRef, {
              assignedUsers: [...current.assignedUsers, nextPerson],
            });
          });

          // Notify replacement with both Confirm and Forfeit buttons
          await sendForfeitNotification(nextPerson, date, assignment.notificationMessageTs ?? '');
          console.log(`Auto-forfeited ${userId} for ${date}, assigned to ${nextPerson}`);
        }
      } else {
        console.log(`Auto-forfeited ${userId} for ${date}, no replacement available`);
      }

      // Record parking history with autoForfeited flag
      const current = await getParkingAssignment(date);
      await addParkingHistory({
        userId,
        date,
        parked: false,
        forfeited: true,
        autoForfeited: true,
        weekStartDate: (current ?? assignment).weekStartDate,
        createdAt: now(),
      });

      // Audit log
      await addAuditLog('FORFEIT', userId, {
        date,
        autoForfeited: true,
        nextPerson: nextPeople.length > 0 ? nextPeople[0] : null,
      });

      autoForfeited.push(userId);
    } catch (error) {
      console.error(`Error auto-forfeiting user ${userId} for ${date}:`, error);
    }
  }

  return autoForfeited;
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
    const db = getFirestore();
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
