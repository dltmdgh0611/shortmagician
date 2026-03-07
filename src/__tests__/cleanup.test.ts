import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

import { cleanupPipeline } from "../lib/pipeline/cleanup";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("cleanupPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls invoke with keepComposed=true", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await cleanupPipeline(true);

    expect(mockInvoke).toHaveBeenCalledWith("cleanup_pipeline", {
      keepComposed: true,
    });
  });

  it("calls invoke with keepComposed=false", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await cleanupPipeline(false);

    expect(mockInvoke).toHaveBeenCalledWith("cleanup_pipeline", {
      keepComposed: false,
    });
  });

  it("silently swallows invoke errors (non-fatal)", async () => {
    mockInvoke.mockRejectedValue(new Error("Tauri not available"));

    // Should NOT throw
    await expect(cleanupPipeline(true)).resolves.toBeUndefined();
  });

  it("silently handles Tauri unavailable (e.g., test/web env)", async () => {
    mockInvoke.mockRejectedValue(new Error("window.__TAURI__ is not defined"));

    await expect(cleanupPipeline(false)).resolves.toBeUndefined();
  });
});
