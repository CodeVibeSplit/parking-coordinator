import { initializeFirebase } from '../src/config/firebase';
import { addVacation } from '../src/services/vacationService';

const USER_ID = 'U01EHTVEGQG';
const START_DATE = '2026-02-25';
const END_DATE = '2026-03-08';

async function main() {
  initializeFirebase();

  console.log(`Adding vacation for ${USER_ID}: ${START_DATE} → ${END_DATE}`);
  const id = await addVacation(USER_ID, START_DATE, END_DATE, USER_ID);
  console.log(`✅ Vacation created with id: ${id}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
