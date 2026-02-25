/**
 * Shifts assignments forward by one day:
 *   2026-02-25 (Wed) plan → 2026-02-26 (Thu)
 *   2026-02-26 (Thu) plan → 2026-02-27 (Fri)
 * Operational fields (confirmed, forfeited, attended, absent, notification)
 * are reset since neither day has happened yet.
 */
import { initializeFirebase } from '../src/config/firebase';
import { getParkingAssignment, setParkingAssignment } from '../src/utils/firestoreUtils';
import type { ParkingAssignment } from '../src/models/types';

function shift(src: ParkingAssignment, newId: string, newDayOfWeek: string): ParkingAssignment {
  return {
    id: newId,
    date: newId,
    dayOfWeek: newDayOfWeek,
    assignedUsers: [...src.assignedUsers],
    originalPrimaryUsers: [...src.originalPrimaryUsers],
    secondaryList: [...src.secondaryList],
    forfeitedUsers: [],
    confirmedUsers: [],
    attendedUsers: [],
    absentUsers: [],
    notificationSentAt: undefined,
    notificationMessageTs: '',
    isFinalized: false,
    weekStartDate: src.weekStartDate,
  };
}

async function main() {
  initializeFirebase();

  const wed = await getParkingAssignment('2026-02-25');
  const thu = await getParkingAssignment('2026-02-26');

  if (!wed) { console.error('No assignment found for 2026-02-25'); process.exit(1); }
  if (!thu) { console.error('No assignment found for 2026-02-26'); process.exit(1); }

  const newThu = shift(wed, '2026-02-26', 'Thursday');
  const newFri = shift(thu, '2026-02-27', 'Friday');

  await setParkingAssignment(newThu);
  console.log('✅ 2026-02-26 (Thu)  assigned:', newThu.assignedUsers.join(', '));

  await setParkingAssignment(newFri);
  console.log('✅ 2026-02-27 (Fri)  assigned:', newFri.assignedUsers.join(', '), ' secondary:', newFri.secondaryList.join(', '));

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
