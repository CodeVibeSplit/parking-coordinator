import { initializeFirebase, getFirestore } from '../src/config/firebase';
import { COLLECTIONS } from '../src/models/constants';

const NAMES: Record<string, string> = {
  U06MU0GR1S8: 'Karlo Vrdoljak',
  UQ6BDGF8W:   'Andela Culjak',
  U07MG81CV9D: 'Ivan Bodrozic',
  UP2A93ZRC:   'Marino Sabic',
  U01EHTVEGQG: 'Miranda Banovic',
};

async function main() {
  initializeFirebase();
  const db = getFirestore();

  for (const [userId, displayName] of Object.entries(NAMES)) {
    await db.collection(COLLECTIONS.USERS).doc(userId).update({ displayName });
    console.log(`✅ ${userId} → ${displayName}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
