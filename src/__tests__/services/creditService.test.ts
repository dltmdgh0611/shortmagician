import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("../../lib/firebase", () => ({
  db: {},
}));

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getCredits, deductCredit } from "../../lib/services/creditService";

// ── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];
const YESTERDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
})();

function mockDocSnap(existsVal: boolean, data: Record<string, unknown> = {}) {
  return {
    exists: () => existsVal,
    data: () => data,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("creditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (doc as Mock).mockReturnValue("docRef");
  });

  // ── getCredits ───────────────────────────────────────────────────────────

  describe("getCredits", () => {
    it("returns credit info for user with current-day data", async () => {
      (getDoc as Mock).mockResolvedValue(
        mockDocSnap(true, {
          plan: "free",
          credits_reset_date: TODAY,
          credits_used_today: 3,
        }),
      );

      const info = await getCredits("uid1");

      expect(info.daily_limit).toBe(10);
      expect(info.used_today).toBe(3);
      expect(info.remaining).toBe(7);
      expect(info.reset_date).toBe(TODAY);
      expect(info.plan).toBe("free");
      // No updateDoc called since date is today
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it("auto-resets credits when date has changed", async () => {
      (getDoc as Mock).mockResolvedValue(
        mockDocSnap(true, {
          plan: "free",
          credits_reset_date: YESTERDAY,
          credits_used_today: 8,
        }),
      );
      (updateDoc as Mock).mockResolvedValue(undefined);

      const info = await getCredits("uid1");

      expect(info.used_today).toBe(0);
      expect(info.remaining).toBe(10);
      expect(info.reset_date).toBe(TODAY);
      expect(updateDoc).toHaveBeenCalledWith(
        "docRef",
        expect.objectContaining({
          credits_used_today: 0,
          credits_reset_date: TODAY,
        }),
      );
    });
  });

  // ── deductCredit ─────────────────────────────────────────────────────────

  describe("deductCredit", () => {
    it("deducts one credit successfully", async () => {
      (getDoc as Mock).mockResolvedValue(
        mockDocSnap(true, {
          plan: "free",
          credits_reset_date: TODAY,
          credits_used_today: 5,
        }),
      );
      (updateDoc as Mock).mockResolvedValue(undefined);

      const info = await deductCredit("uid1");

      expect(info.used_today).toBe(6);
      expect(info.remaining).toBe(4);
      // updateDoc called for the deduction (not for reset since date is today)
      expect(updateDoc).toHaveBeenCalledWith(
        "docRef",
        expect.objectContaining({ credits_used_today: 6 }),
      );
    });

    it("throws error when credits are exhausted", async () => {
      (getDoc as Mock).mockResolvedValue(
        mockDocSnap(true, {
          plan: "free",
          credits_reset_date: TODAY,
          credits_used_today: 10,
        }),
      );

      await expect(deductCredit("uid1")).rejects.toThrow(
        "오늘의 크레딧을 모두 사용했습니다",
      );
    });
  });
});
