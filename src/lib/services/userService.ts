import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export interface UserProfileData {
  uid: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  plan: string;
  subscription_status: string;
  quota: Record<string, unknown>;
}

/**
 * Create or get user profile (idempotent).
 * If user document exists, return it. Otherwise, create a new one.
 */
export async function createOrGetUser(
  uid: string,
  email: string,
  displayName: string
): Promise<UserProfileData> {
  if (!db) throw new Error("Firestore를 사용할 수 없습니다");

  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    return _mapFirestoreData(uid, data);
  }

  // Create new profile
  const now = new Date().toISOString();
  const profile = {
    uid,
    email,
    display_name: displayName,
    created_at: now,
    updated_at: now,
    plan: "free",
    subscription_status: "none",
    quota: {},
  };
  await setDoc(docRef, profile);
  return profile;
}

/**
 * Get current user's profile.
 */
export async function getMyProfile(uid: string): Promise<UserProfileData> {
  if (!db) throw new Error("Firestore를 사용할 수 없습니다");

  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error("사용자 프로필을 찾을 수 없습니다");
  }

  return _mapFirestoreData(uid, docSnap.data());
}

/**
 * Update current user's profile (display_name, etc.).
 */
export async function updateMyProfile(
  uid: string,
  updates: { display_name?: string }
): Promise<UserProfileData> {
  if (!db) throw new Error("Firestore를 사용할 수 없습니다");

  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error("사용자 프로필을 찾을 수 없습니다");
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.display_name !== undefined) {
    updatePayload.display_name = updates.display_name;
  }

  await updateDoc(docRef, updatePayload);

  // Return updated profile
  const updated = await getDoc(docRef);
  return _mapFirestoreData(uid, updated.data()!);
}

/**
 * Convert Firestore document data to UserProfileData.
 * Handles Timestamp conversion and field mapping.
 */
function _mapFirestoreData(
  uid: string,
  data: Record<string, unknown>
): UserProfileData {
  const toISOString = (value: unknown): string => {
    if (!value) return new Date().toISOString();
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (typeof value === "string") return value;
    return new Date().toISOString();
  };

  return {
    uid,
    email: (data.email as string) || "",
    display_name: (data.display_name as string) || "",
    created_at: toISOString(data.created_at),
    updated_at: toISOString(data.updated_at),
    plan: (data.plan as string) || "free",
    subscription_status: (data.subscription_status as string) || "none",
    quota: (data.quota as Record<string, unknown>) || {},
  };
}
