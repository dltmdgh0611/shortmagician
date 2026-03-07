/**
 * Open a URL in the system default browser.
 * Uses Tauri's opener plugin when running inside Tauri,
 * falls back to window.open() for regular browser environments (dev/test).
 */
export async function openUrl(url: string): Promise<void> {
  try {
    const { openUrl: tauriOpen } = await import("@tauri-apps/plugin-opener");
    await tauriOpen(url);
  } catch {
    // Not running inside Tauri (e.g. vitest, plain browser)
    window.open(url, "_blank");
  }
}
