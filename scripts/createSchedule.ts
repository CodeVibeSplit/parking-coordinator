/**
 * Creates a parking assignment for a specific date.
 * Usage: npx tsx scripts/createSchedule.ts [YYYY-MM-DD]
 * Defaults to next workday if no date is provided.
 * Admin is always placed last in the secondary list.
 */
import { initializeFirebase } from '../src/config/firebase';
import { getConfig, getParkingAssignment, setParkingAssignment } from '../src/utils/firestoreUtils';
import { calculateNextAssignments } from '../src/services/rotationService';
import { getSecondaryList } from '../src/services/pointsService';
import {
  getNextWorkday,
  toISODate,
  getDayOfWeek,
  getCurrentWeekStart,
  fromISODate,
} from '../src/utils/dateUtils';
import type { ParkingAssignment } from '../src/models/types';

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

async function main() {
  initializeFirebase();

  const config = await getConfig();
  if (!config) {
    console.error('No config found — aborting');
    process.exit(1);
  }

  // Accept optional date argument, default to next workday
  const rawArg = process.argv[2];
  const targetDate = rawArg ? fromISODate(rawArg) : getNextWorkday();
  const dateStr = toISODate(targetDate);

  console.log(`\nCreating assignment for ${fmtDate(dateStr)}...`);

  const existing = await getParkingAssignment(dateStr);
  if (existing) {
    console.log(`  ⚠️  Existing assignment found — overwriting`);
    console.log(`     assignedUsers:  ${existing.assignedUsers.join(', ')}`);
    console.log(`     secondaryList:  ${existing.secondaryList.join(', ')}`);
  }

  const primaryUsers = await calculateNextAssignments(targetDate, config.availableSpots);
  console.log(`  Primary users: ${primaryUsers.join(', ')}`);

  // Secondary list sorted by points desc, admin forced last
  const adminId = config.adminUserIds[0];
  const rawSecondary = await getSecondaryList(dateStr, primaryUsers);
  const withoutAdmin = rawSecondary.filter((u) => u.userId !== adminId);
  const adminEntry = rawSecondary.find((u) => u.userId === adminId);
  const secondaryIds = adminEntry
    ? [...withoutAdmin, adminEntry].map((u) => u.userId)
    : withoutAdmin.map((u) => u.userId);

  console.log(`  Secondary list: ${secondaryIds.join(', ')} (admin ${adminId} last)`);

  const assignment: ParkingAssignment = {
    id: dateStr,
    date: dateStr,
    dayOfWeek: getDayOfWeek(targetDate),
    assignedUsers: [...primaryUsers],
    forfeitedUsers: [],
    confirmedUsers: [],
    originalPrimaryUsers: [...primaryUsers],
    secondaryList: secondaryIds,
    attendedUsers: [],
    absentUsers: [],
    notificationSentAt: undefined,
    notificationMessageTs: '',
    isFinalized: false,
    weekStartDate: toISODate(getCurrentWeekStart()),
  };

  await setParkingAssignment(assignment);
  console.log(`  ✅ Assignment saved for ${fmtDate(dateStr)}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
