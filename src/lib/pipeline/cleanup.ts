import { invoke } from "@tauri-apps/api/core";

/**
 * Clean up the pipeline working directory.
 *
 * @param keepComposed - If true, keeps composed.mp4 and deletes intermediates only.
 *                       If false, deletes the entire pipeline/ directory.
 */
export async function cleanupPipeline(keepComposed: boolean): Promise<void> {
  try {
    await invoke("cleanup_pipeline", { keepComposed });
  } catch {
    // Tauri not available (test/web) or cleanup failed — non-fatal
  }
}
