import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("firebase/firestore", () => {
  // Timestamp must be a constructor so `instanceof Timestamp` doesn't throw
  function MockTimestamp() {}
  MockTimestamp.fromDate = vi.fn();
  MockTimestamp.now = vi.fn();
  return {
    doc: vi.fn(),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    Timestamp: MockTimestamp,
  };
});

vi.mock("../../lib/firebase", () => ({
  db: {}, // non-null mock
}));

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import {
  createOrGetUser,
  getMyProfile,
  updateMyProfile,
} from "../../lib/services/userService";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockDocSnap(existsVal: boolean, data: Record<string, unknown> = {}) {
  return {
    exists: () => existsVal,
    data: () => data,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("userService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (doc as Mock).mockReturnValue("docRef");
  });

  // ── createOrGetUser ──────────────────────────────────────────────────────

  describe("createOrGetUser", () => {
    it("creates a new user when document does not exist", async () => {
      (getDoc as Mock).mockResolvedValue(mockDocSnap(false));
      (setDoc as Mock).mockResolvedValue(undefined);

      const result = await createOrGetUser("uid1", "a@b.com", "Alice");

      expect(doc).toHaveBeenCalledWith({}, "users", "uid1");
      expect(setDoc).toHaveBeenCalledWith(
        "docRef",
        expect.objectContaining({
          uid: "uid1",
          email: "a@b.com",
          display_name: "Alice",
          plan: "free",
          subscription_status: "none",
        }),
      );
      expect(result.uid).toBe("uid1");
      expect(result.email).toBe("a@b.com");
      expect(result.plan).toBe("free");
    });

    it("returns existing user when document exists", async () => {
      const existing = {
        email: "a@b.com",
        display_name: "Alice",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        plan: "earlybird",
        subscription_status: "active",
        quota: { daily: 50 },
      };
      (getDoc as Mock).mockResolvedValue(mockDocSnap(true, existing));

      const result = await createOrGetUser("uid1", "a@b.com", "Alice");

      expect(setDoc).not.toHaveBeenCalled();
      expect(result.plan).toBe("earlybird");
      expect(result.subscription_status).toBe("active");
    });
  });

  // ── getMyProfile ─────────────────────────────────────────────────────────

  describe("getMyProfile", () => {
    it("returns profile when user exists", async () => {
      const data = {
        email: "bob@test.com",
        display_name: "Bob",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
        plan: "free",
        subscription_status: "none",
        quota: {},
      };
      (getDoc as Mock).mockResolvedValue(mockDocSnap(true, data));

      const result = await getMyProfile("uid2");

      expect(result.uid).toBe("uid2");
      expect(result.display_name).toBe("Bob");
      expect(result.email).toBe("bob@test.com");
    });

    it("throws error when user does not exist", async () => {
      (getDoc as Mock).mockResolvedValue(mockDocSnap(false));

      await expect(getMyProfile("uid_missing")).rejects.toThrow(
        "사용자 프로필을 찾을 수 없습니다",
      );
    });
  });

  // ── updateMyProfile ──────────────────────────────────────────────────────

  describe("updateMyProfile", () => {
    it("updates display_name and returns updated profile", async () => {
      const original = {
        email: "c@d.com",
        display_name: "Old",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        plan: "free",
        subscription_status: "none",
        quota: {},
      };
      const updated = { ...original, display_name: "New" };

      // First getDoc: exists check. Second getDoc: after updateDoc.
      (getDoc as Mock)
        .mockResolvedValueOnce(mockDocSnap(true, original))
        .mockResolvedValueOnce(mockDocSnap(true, updated));
      (updateDoc as Mock).mockResolvedValue(undefined);

      const result = await updateMyProfile("uid3", { display_name: "New" });

      expect(updateDoc).toHaveBeenCalledWith(
        "docRef",
        expect.objectContaining({ display_name: "New" }),
      );
      expect(result.display_name).toBe("New");
    });
  });
});
