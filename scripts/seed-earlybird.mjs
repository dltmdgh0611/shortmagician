/**
 * Seed 1000 earlybird codes into Firestore.
 * Usage: node scripts/seed-earlybird.mjs
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(__dirname, "../backend/serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

// Init Firebase Admin
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Code generation (same logic as backend)
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1

function generateCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

async function seed(count = 1000) {
  const codesRef = db.collection("earlybird_codes");

  // Check existing count
  const snapshot = await codesRef.count().get();
  const existing = snapshot.data().count;
  if (existing >= count) {
    console.log(`이미 ${existing}개의 코드가 존재합니다. 스킵.`);
    return;
  }

  // Generate unique codes
  const codes = new Set();
  while (codes.size < count) {
    codes.add(generateCode());
  }

  // Batch write (max 500 per batch)
  const BATCH_SIZE = 450;
  const codesArr = [...codes];
  let created = 0;

  for (let i = 0; i < codesArr.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = codesArr.slice(i, i + BATCH_SIZE);

    for (const code of chunk) {
      const docRef = codesRef.doc(code);
      batch.set(
        docRef,
        {
          code,
          used: false,
          used_by: null,
          used_at: null,
          created_at: new Date(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    created += chunk.length;
    console.log(`  배치 커밋: ${created}/${count}`);
  }

  console.log(`\n✅ ${created}개의 얼리버드 코드가 Firestore에 생성되었습니다.`);
}

seed().catch((err) => {
  console.error("❌ 시딩 실패:", err);
  process.exit(1);
});
