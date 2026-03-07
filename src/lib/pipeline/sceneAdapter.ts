import type { PipelineSegment } from "../types/pipeline";
import type { Scene } from "../../components/shorts/ShortsCenterPanel";

/**
 * Convert a PipelineSegment into a Scene for use in the editor.
 *
 * @param segment - Source pipeline segment.
 * @param index   - Zero-based index used as the numeric Scene id.
 */
export function segmentToScene(segment: PipelineSegment, index: number): Scene {
  return {
    id: index,
    text: segment.translatedText,
    duration: Math.round(segment.endTime - segment.startTime),
  };
}

/**
 * Merge editor Scene changes back into a PipelineSegment.
 * Only `translatedText` is carried over — all other pipeline fields are preserved.
 *
 * @param scene   - Edited scene from the editor.
 * @param segment - Original pipeline segment to update.
 */
export function sceneToSegment(scene: Scene, segment: PipelineSegment): PipelineSegment {
  return {
    ...segment,
    translatedText: scene.text,
  };
}
