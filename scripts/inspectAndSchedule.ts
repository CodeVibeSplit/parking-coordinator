import { initializeFirebase } from '../src/config/firebase';
import { COLLECTIONS } from '../src/models/constants';
import { getFirestore } from '../src/config/firebase';
import { getConfig, getRotationState } from '../src/utils/firestoreUtils';
import { getCurrentDate, toISODate, addDays } from '../src/utils/dateUtils';
import type { User, Vacation, ParkingAssignment, WeeklySchedule } from '../src/models/types';
import type { Timestamp } from 'firebase-admin/firestore';

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function fmtTimestamp(ts: Timestamp): string {
  const d = ts.toDate();
  const day  = String(d.getDate()).padStart(2, '0');
  const mon  = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hh   = String(d.getHours()).padStart(2, '0');
  const mm   = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${mon}.${year} ${hh}:${mm}`;
}

async function main() {
  initializeFirebase();
  const db = getFirestore();

  // ── USERS ──────────────────────────────────────────────────────────────────
  console.log('\n=== USERS ===');
  const usersSnap = await db.collection(COLLECTIONS.USERS).get();
  if (usersSnap.empty) {
    console.log('  (none)');
  } else {
    for (const doc of usersSnap.docs) {
      const u = doc.data() as User;
      const registered = u.registeredAt ? fmtTimestamp(u.registeredAt) : '(not set)';
      const name = u.displayName ? `${u.displayName}` : '(no name)';
      console.log(`  ${u.userId}  ${name.padEnd(20)}  points=${String(u.points ?? 0).padStart(3)}  registeredAt=${registered}  active=${u.isActive}`);
    }
  }

  // ── CONFIG ─────────────────────────────────────────────────────────────────
  console.log('\n=== CONFIG ===');
  const config = await getConfig();
  if (!config) {
    console.log('  (none)');
  } else {
    console.log(`  teamMembers:    ${config.teamMembers.join(', ')}`);
    console.log(`  rotationOrder:  ${config.rotationOrder.join(', ')}`);
    console.log(`  availableSpots: ${config.availableSpots}`);
    console.log(`  adminUserIds:   ${config.adminUserIds.join(', ')}`);
  }

  // ── ROTATION STATE (deprecated — kept for reference) ──────────────────────
  console.log('\n=== ROTATION STATE (deprecated) ===');
  const rotation = await getRotationState();
  if (!rotation) {
    console.log('  (none)');
  } else {
    console.log(`  weekStartDate:        ${fmtDate(rotation.weekStartDate)}`);
    console.log(`  currentWeekOrder:     ${rotation.currentWeekOrder.join(', ')}`);
    console.log(`  currentRotationIndex: ${rotation.currentRotationIndex}`);
    console.log(`  lastAssignmentDate:   ${fmtDate(rotation.lastAssignmentDate)}`);
  }

  // ── WEEKLY SCHEDULES ───────────────────────────────────────────────────────
  console.log('\n=== WEEKLY SCHEDULES ===');
  const weeklySnap = await db.collection(COLLECTIONS.WEEKLY_SCHEDULE).orderBy('weekStartDate', 'desc').limit(4).get();
  if (weeklySnap.empty) {
    console.log('  (none)');
  } else {
    for (const doc of weeklySnap.docs) {
      const w = doc.data() as WeeklySchedule;
      console.log(`  ${fmtDate(w.weekStartDate)}  primaries: ${w.primaryUserIds.join(', ')}  by: ${w.announcedBy}`);
    }
  }

  // ── VACATIONS ──────────────────────────────────────────────────────────────
  console.log('\n=== VACATIONS ===');
  const vacSnap = await db.collection(COLLECTIONS.VACATIONS).orderBy('startDate', 'asc').get();
  if (vacSnap.empty) {
    console.log('  (none)');
  } else {
    for (const doc of vacSnap.docs) {
      const v = doc.data() as Vacation;
      console.log(`  ${v.userId}  ${fmtDate(v.startDate)} → ${fmtDate(v.endDate)}  id=${doc.id}`);
    }
  }

  // ── UPCOMING PARKING ASSIGNMENTS (next 10 weekdays) ───────────────────────
  console.log('\n=== UPCOMING ASSIGNMENTS ===');
  const today = toISODate(getCurrentDate());
  const until = toISODate(addDays(getCurrentDate(), 14));
  const assignSnap = await db
    .collection(COLLECTIONS.PARKING_ASSIGNMENTS)
    .where('date', '>=', today)
    .where('date', '<=', until)
    .orderBy('date', 'asc')
    .get();
  if (assignSnap.empty) {
    console.log('  (none in next 14 days)');
  } else {
    for (const doc of assignSnap.docs) {
      const a = doc.data() as ParkingAssignment;
      const status = a.isFinalized ? 'finalized' : 'open';
      console.log(`  ${fmtDate(a.date)}  ${a.dayOfWeek.padEnd(9)}  assigned: ${a.assignedUsers.join(', ')}  secondary: ${a.secondaryList.join(', ') || '—'}  [${status}]`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
