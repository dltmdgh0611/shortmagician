import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("../../lib/firebase", () => ({
  db: {},
}));

import { doc, getDoc, runTransaction } from "firebase/firestore";
import { redeemCode } from "../../lib/services/earlybirdService";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockDocSnap(existsVal: boolean, data: Record<string, unknown> = {}) {
  return {
    exists: () => existsVal,
    data: () => data,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("earlybirdService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // doc returns distinct refs based on collection path
    (doc as Mock).mockImplementation(
      (_db: unknown, collection: string, id: string) =>
        `${collection}/${id}`,
    );
  });

  // ── redeemCode success ───────────────────────────────────────────────────

  it("successfully redeems a valid unused code", async () => {
    // User exists with free plan
    (getDoc as Mock).mockImplementation((ref: string) => {
      if (ref.startsWith("users/")) {
        return Promise.resolve(
          mockDocSnap(true, { plan: "free", subscription_status: "none" }),
        );
      }
      // Code exists, unused
      return Promise.resolve(
        mockDocSnap(true, { used: false, created_at: "2026-01-01" }),
      );
    });

    // Transaction succeeds
    (runTransaction as Mock).mockImplementation(
      async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          get: vi.fn().mockResolvedValue(
            mockDocSnap(true, { used: false }),
          ),
          update: vi.fn(),
        };
        await fn(tx);
      },
    );

    const result = await redeemCode("uid1", "ABC123");

    expect(result.success).toBe(true);
    expect(result.plan).toBe("earlybird");
    expect(result.message).toContain("활성화");
  });

  // ── redeemCode: already used code ────────────────────────────────────────

  it("throws error for already-used code", async () => {
    (getDoc as Mock).mockImplementation((ref: string) => {
      if (ref.startsWith("users/")) {
        return Promise.resolve(
          mockDocSnap(true, { plan: "free" }),
        );
      }
      // Code is used
      return Promise.resolve(
        mockDocSnap(true, { used: true, used_by: "other_uid" }),
      );
    });

    await expect(redeemCode("uid1", "ABC123")).rejects.toThrow(
      "이미 사용된 코드입니다",
    );
  });

  // ── redeemCode: non-existent code ────────────────────────────────────────

  it("throws error for non-existent code", async () => {
    (getDoc as Mock).mockImplementation((ref: string) => {
      if (ref.startsWith("users/")) {
        return Promise.resolve(
          mockDocSnap(true, { plan: "free" }),
        );
      }
      // Code does not exist
      return Promise.resolve(mockDocSnap(false));
    });

    await expect(redeemCode("uid1", "XXXXXX")).rejects.toThrow(
      "존재하지 않는 코드입니다",
    );
  });

  // ── redeemCode: already earlybird user ───────────────────────────────────

  it("returns failure when user already has earlybird plan", async () => {
    (getDoc as Mock).mockImplementation((ref: string) => {
      if (ref.startsWith("users/")) {
        return Promise.resolve(
          mockDocSnap(true, { plan: "earlybird", subscription_status: "active" }),
        );
      }
      // Code exists and unused
      return Promise.resolve(
        mockDocSnap(true, { used: false }),
      );
    });

    const result = await redeemCode("uid1", "ABC123");

    expect(result.success).toBe(false);
    expect(result.plan).toBe("earlybird");
    expect(result.message).toContain("이미 얼리버드");
  });
});
