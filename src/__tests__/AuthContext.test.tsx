import React from "react";
import { renderHook, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  setPersistence,
  updateProfile,
} from "firebase/auth";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  setPersistence: vi.fn(),
  browserLocalPersistence: {},
  updateProfile: vi.fn(),
}));

vi.mock("../lib/firebase", () => ({ auth: {} }));

vi.mock("../lib/api", () => ({
  api: {
    post: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({
      data: {
        uid: "u1",
        email: "e@e.com",
        display_name: "Test",
        plan: "free",
        subscription_status: "none",
        quota: { used: 0, limit: 10 },
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      },
    }),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AuthContext", () => {
  let authStateCallback: ((user: any) => void) | null = null;

  beforeEach(() => {
    authStateCallback = null;
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
      authStateCallback = cb as (user: any) => void;
      return vi.fn(); // unsubscribe
    });
    vi.mocked(setPersistence).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it("onAuthStateChanged called with null → status becomes unauthenticated", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      authStateCallback!(null);
    });

    expect(result.current.state.status).toBe("unauthenticated");
    expect(result.current.state.user).toBeNull();
    expect(result.current.state.error).toBeNull();
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it("onAuthStateChanged called with user → status becomes authenticated", async () => {
    const mockUser = { uid: "u1", email: "e@e.com", displayName: "Test" };
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      authStateCallback!(mockUser);
    });

    expect(result.current.state.status).toBe("authenticated");
    expect(result.current.state.user).toBe(mockUser);
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  it("login calls signInWithEmailAndPassword with correct args", async () => {
    const mockUser = { uid: "u1", email: "test@test.com", displayName: null };
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: mockUser,
    } as any);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      authStateCallback!(null);
    });

    await act(async () => {
      await result.current.login("test@test.com", "password123");
    });

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      {},
      "test@test.com",
      "password123"
    );
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────
  it("signup calls createUserWithEmailAndPassword and updateProfile", async () => {
    const mockUser = { uid: "u1", email: "test@test.com", displayName: null };
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
      user: mockUser,
    } as any);
    vi.mocked(updateProfile).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      authStateCallback!(null);
    });

    await act(async () => {
      await result.current.signup("test@test.com", "password123", "TestUser");
    });

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      {},
      "test@test.com",
      "password123"
    );
    expect(updateProfile).toHaveBeenCalledWith(mockUser, {
      displayName: "TestUser",
    });
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────
  it("logout calls signOut", async () => {
    vi.mocked(signOut).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      authStateCallback!(null);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(signOut).toHaveBeenCalledWith({});
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────
  it("Firebase error in login → Korean error message set in state", async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue({
      code: "auth/wrong-password",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      authStateCallback!(null);
    });

    await act(async () => {
      try {
        await result.current.login("test@test.com", "wrongpassword");
      } catch (_) {
        // expected to throw
      }
    });

    expect(result.current.state.error).toBe("비밀번호가 올바르지 않습니다");
  });
});
