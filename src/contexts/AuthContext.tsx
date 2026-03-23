import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  updateProfile,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { createOrGetUser, getMyProfile, updateMyProfile } from "../lib/services/userService";
import { getCredits } from "../lib/services/creditService";

// Maps backend snake_case response to UserProfile camelCase
const mapBackendProfile = (data: any): UserProfile => ({
  uid: data.uid,
  email: data.email,
  displayName: data.display_name,
  plan: data.plan,
  subscriptionStatus: data.subscription_status,
  quota: data.quota,

  createdAt: data.created_at,
  updatedAt: data.updated_at,
});

// Types
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  plan: string;
  subscriptionStatus: string;
  quota: {
    used: number;
    limit: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated";
  user: User | null;
  profile: UserProfile | null;
  error: string | null;
}

export interface AuthContextType {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateUserProfile: (data: { displayName?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  isNewSignup: boolean;
  clearNewSignup: () => void;
  fetchCredits: () => Promise<{ dailyLimit: number; usedToday: number; remaining: number; resetDate: string } | null>;
}

// Context
const AuthContext = createContext<AuthContextType | null>(null);

// Error message mapping
const getErrorMessage = (code: string): string => {
  const errorMessages: Record<string, string> = {
    "auth/email-already-in-use": "이미 사용 중인 이메일입니다",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다",
    "auth/user-not-found": "등록되지 않은 이메일입니다",
    "auth/weak-password": "비밀번호는 6자 이상이어야 합니다",
    "auth/invalid-email": "올바른 이메일 형식이 아닙니다",
    "auth/too-many-requests": "너무 많은 시도입니다. 잠시 후 다시 시도하세요",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다",
  };
  return errorMessages[code] || "알 수 없는 오류가 발생했습니다";
};

// Provider
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    profile: null,
    error: null,
  });
  const [isNewSignup, setIsNewSignup] = useState(false);

  useEffect(() => {
    // Check if auth is null (Firebase init failed)
    if (auth === null) {
      setState({
        status: "unauthenticated",
        user: null,
        profile: null,
        error: "Firebase 인증을 초기화할 수 없습니다",
      });
      return;
    }

    // Set persistence for Tauri compatibility
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error("Failed to set persistence:", error);
    });

    // Listen to auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Set authenticated immediately — don't wait for profile fetch
        setState({
          status: "authenticated",
          user,
          profile: null,
          error: null,
        });

        // Fetch profile from Firestore async — failure is silently ignored
        getMyProfile(user.uid)
          .then((data) => {
            const profile = mapBackendProfile(data);
            setState((prev) => ({ ...prev, profile }));
          })
          .catch(() => {
            // Firestore may be unavailable — profile stays null
          });
      } else {
        setState({
          status: "unauthenticated",
          user: null,
          profile: null,
          error: null,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    if (auth === null) {
      throw new Error("Firebase 인증을 사용할 수 없습니다");
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Ensure user profile exists in Firestore — failure is silently caught (Firebase auth state preserved)
      try {
        await createOrGetUser(
          userCredential.user.uid,
          userCredential.user.email!,
          userCredential.user.displayName || ""
        );
      } catch (_) {
        // Firestore may be unavailable — ignore
      }
    } catch (error: any) {
      const message = getErrorMessage(error.code);
      setState((prev) => ({ ...prev, error: message }));
      throw new Error(message);
    }
  };

  const signup = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<void> => {
    if (auth === null) {
      throw new Error("Firebase 인증을 사용할 수 없습니다");
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Update Firebase Auth profile with displayName
      await updateProfile(userCredential.user, { displayName });
      // Ensure user profile exists in Firestore — failure is silently caught (Firebase auth state preserved)
      try {
        await createOrGetUser(
          userCredential.user.uid,
          email,
          displayName
        );
      } catch (_) {
        // Firestore may be unavailable — ignore
      }
      setIsNewSignup(true);
    } catch (error: any) {
      const message = getErrorMessage(error.code);
      setState((prev) => ({ ...prev, error: message }));
      throw new Error(message);
    }
  };

  const refreshProfile = async () => {
    try {
      if (!auth?.currentUser) return;
      const data = await getMyProfile(auth.currentUser.uid);
      const profile = mapBackendProfile(data);
      setState((prev) => ({ ...prev, profile }));
    } catch {
      // ignore
    }
  };

  const clearNewSignup = () => setIsNewSignup(false);

  const fetchCredits = async () => {
    try {
      if (!auth?.currentUser) return null;
      const data = await getCredits(auth.currentUser.uid);
      return {
        dailyLimit: data.daily_limit,
        usedToday: data.used_today,
        remaining: data.remaining,
        resetDate: data.reset_date,
      };
    } catch {
      return null;
    }
  };

  const updateUserProfile = async (data: {
    displayName?: string;
  }): Promise<void> => {
    if (auth === null) {
      throw new Error("Firebase 인증을 사용할 수 없습니다");
    }

    // Update Firebase Auth displayName if provided
    if (data.displayName !== undefined && auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: data.displayName });
    }

    // Update Firestore profile
    await updateMyProfile(auth.currentUser!.uid, {
      display_name: data.displayName,
    });

    // Refresh local profile
    await refreshProfile();
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<void> => {
    if (auth === null || !auth.currentUser || !auth.currentUser.email) {
      throw new Error("Firebase 인증을 사용할 수 없습니다");
    }

    // Reauthenticate with current password
    const credential = EmailAuthProvider.credential(
      auth.currentUser.email,
      currentPassword,
    );
    await reauthenticateWithCredential(auth.currentUser, credential);

    // Update password
    await firebaseUpdatePassword(auth.currentUser, newPassword);
  };

  const logout = async (): Promise<void> => {
    if (auth === null) {
      throw new Error("Firebase 인증을 사용할 수 없습니다");
    }

    try {
      await signOut(auth);
      setState({
        status: "unauthenticated",
        user: null,
        profile: null,
        error: null,
      });
    } catch (error: any) {
      const message = getErrorMessage(error.code);
      setState((prev) => ({ ...prev, error: message }));
      throw new Error(message);
    }
  };

  return (
    <AuthContext.Provider value={{ state, login, signup, logout, refreshProfile, updateUserProfile, changePassword, isNewSignup, clearNewSignup, fetchCredits }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
