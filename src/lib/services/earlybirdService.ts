import {
  doc,
  getDoc,
  runTransaction,
} from "firebase/firestore";
import { db } from "../firebase";

export interface EarlybirdRedeemResponse {
  success: boolean;
  plan: string;
  message: string;
}

/**
 * Redeem an earlybird code for the current user.
 * Uses transaction to ensure atomicity:
 * - Validates code exists and is unused
 * - Marks code as used
 * - Updates user plan to 'earlybird'
 */
export async function redeemCode(
  uid: string,
  code: string
): Promise<EarlybirdRedeemResponse> {
  if (!db) throw new Error("Firestore를 사용할 수 없습니다");

  const normalizedCode = code.trim().toUpperCase();

  // Validate code length
  if (normalizedCode.length !== 6) {
    throw new Error("코드는 6자리여야 합니다");
  }

  // Check if user already has earlybird plan
  const userDocRef = doc(db, "users", uid);
  const userDocSnap = await getDoc(userDocRef);

  if (userDocSnap.exists()) {
    const userData = userDocSnap.data();
    if (userData.plan === "earlybird") {
      return {
        success: false,
        plan: "earlybird",
        message: "이미 얼리버드 플랜을 사용 중입니다",
      };
    }
  }

  // Check code exists and is unused (before transaction)
  const codeDocRef = doc(db, "earlybird_codes", normalizedCode);
  const codeDocSnap = await getDoc(codeDocRef);

  if (!codeDocSnap.exists()) {
    throw new Error("존재하지 않는 코드입니다");
  }

  const codeData = codeDocSnap.data();
  if (codeData.used) {
    throw new Error("이미 사용된 코드입니다");
  }

  // Transaction: mark code as used and update user plan
  try {
    await runTransaction(db, async (transaction) => {
      // Re-check code within transaction to prevent race condition
      const codeDocInTx = await transaction.get(codeDocRef);
      if (!codeDocInTx.exists()) {
        throw new Error("존재하지 않는 코드입니다");
      }

      const codeDataInTx = codeDocInTx.data();
      if (codeDataInTx.used) {
        throw new Error("이미 사용된 코드입니다");
      }

      // Mark code as used
      const now = new Date().toISOString();
      transaction.update(codeDocRef, {
        used: true,
        used_by: uid,
        used_at: now,
      });

      // Update user plan
      transaction.update(userDocRef, {
        plan: "earlybird",
        subscription_status: "active",
        updated_at: now,
      });
    });

    return {
      success: true,
      plan: "earlybird",
      message: "얼리버드 플랜이 활성화되었습니다!",
    };
  } catch (error) {
    // Re-throw transaction errors
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("코드 사용 중 오류가 발생했습니다");
  }
}
