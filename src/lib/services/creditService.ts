import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const DAILY_LIMIT = 10;

export interface CreditInfo {
  daily_limit: number;
  used_today: number;
  remaining: number;
  reset_date: string;
  plan: string;
}

/**
 * Get current user's daily credit usage.
 * Auto-resets credits if new day detected.
 */
export async function getCredits(uid: string): Promise<CreditInfo> {
  if (!db) throw new Error("Firestore를 사용할 수 없습니다");

  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error("사용자를 찾을 수 없습니다");
  }

  const data = docSnap.data();
  const today = new Date().toISOString().split("T")[0]; // "2026-03-23"
  const plan = data.plan || "free";

  let creditsResetDate = data.credits_reset_date || "";
  let creditsUsedToday = data.credits_used_today || 0;

  // Auto-reset on new day
  if (creditsResetDate !== today) {
    creditsUsedToday = 0;
    await updateDoc(docRef, {
      credits_used_today: 0,
      credits_reset_date: today,
      updated_at: new Date().toISOString(),
    });
    creditsResetDate = today;
  }

  const remaining = Math.max(0, DAILY_LIMIT - creditsUsedToday);

  return {
    daily_limit: DAILY_LIMIT,
    used_today: creditsUsedToday,
    remaining,
    reset_date: creditsResetDate,
    plan,
  };
}

/**
 * Deduct one credit from user's daily quota.
 * Throws error if no credits remaining.
 */
export async function deductCredit(uid: string): Promise<CreditInfo> {
  if (!db) throw new Error("Firestore를 사용할 수 없습니다");

  const info = await getCredits(uid);

  if (info.remaining <= 0) {
    throw new Error(
      "오늘의 크레딧을 모두 사용했습니다. 내일 다시 시도해주세요."
    );
  }

  const docRef = doc(db, "users", uid);
  const newUsed = info.used_today + 1;

  await updateDoc(docRef, {
    credits_used_today: newUsed,
    updated_at: new Date().toISOString(),
  });

  return {
    daily_limit: info.daily_limit,
    used_today: newUsed,
    remaining: info.daily_limit - newUsed,
    reset_date: info.reset_date,
    plan: info.plan,
  };
}

/**
 * Reset credits for testing. Sets used_today back to 0.
 */
export async function resetCredits(uid: string): Promise<CreditInfo> {
  if (!db) throw new Error("Firestore를 사용할 수 없습니다");

  const today = new Date().toISOString().split("T")[0];
  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error("사용자를 찾을 수 없습니다");
  }

  const data = docSnap.data();
  const plan = data.plan || "free";

  await updateDoc(docRef, {
    credits_used_today: 0,
    credits_reset_date: today,
    updated_at: new Date().toISOString(),
  });

  return {
    daily_limit: DAILY_LIMIT,
    used_today: 0,
    remaining: DAILY_LIMIT,
    reset_date: today,
    plan,
  };
}
