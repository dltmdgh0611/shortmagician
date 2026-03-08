import { api } from "../api";
import { extractAudio } from "./audioExtractor";
import { mergeTtsAudio } from "./videoComposer";
import { cleanupPipeline } from "./cleanup";
// splitLongSegments & createSubtitlesFromWords for subtitle generation
import { splitLongSegments, createSubtitlesFromWords } from "./segmentSplitter";
import type {
  PipelineResult,
  PipelineSegment,
  SubtitleSegment,
  SupportedLanguage,
} from "../types/pipeline";
import {
  readFile,
  writeFile,
  exists,
  mkdir,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

// ── Retry helper ─────────────────────────────────────────────────────────────

const API_RETRIES = 2;

/**
 * Retry wrapper for network-level failures (no response from server).
 * Does NOT retry on 4xx/5xx — those are server-side errors with a response.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  emitLog?: (level: PipelineLogEntry['level'], msg: string) => void,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= API_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const isNetwork = !err.response; // no response = connection dropped
      if (isNetwork && attempt < API_RETRIES) {
        const delay = 1000 * (attempt + 1);
        emitLog?.('detail', `  ⚠️ ${label} 네트워크 오류, ${attempt + 1}번째 재시도 (${delay}ms 후)...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr; // unreachable but satisfies TS
}

// ── Types ────────────────────────────────────────────────────────────────────

export type PipelineStep =
  | "extracting"
  | "transcribing"
  | "translating"
  | "synthesizing"
  | "realigning"
  | "merging_tts";

export interface PipelineProgress {
  step: PipelineStep;
  stepIndex: number;
  totalSteps: number;
  message: string;
}

export interface PipelineLogEntry {
  timestamp: number;
  level: 'info' | 'success' | 'error' | 'detail';
  message: string;
}

// ── Console Logger ──────────────────────────────────────────────────────────

const LOG_STYLES = {
  header: "background: #4F46E5; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold;",
  success: "background: #059669; color: white; padding: 2px 8px; border-radius: 4px;",
  error: "background: #DC2626; color: white; padding: 2px 8px; border-radius: 4px;",
  info: "color: #6366F1; font-weight: bold;",
  dim: "color: #9CA3AF;",
};

function logStep(stepIndex: number, total: number, emoji: string, label: string) {
  console.log(
    `%c Pipeline %c Step ${stepIndex + 1}/${total}: ${emoji} ${label}`,
    LOG_STYLES.header,
    LOG_STYLES.info,
  );
}

function logSuccess(message: string, detail?: string) {
  const detailStr = detail ? `  \u2192 ${detail}` : "";
  console.log(`%c \u2705 ${message}${detailStr}`, LOG_STYLES.success);
}

function logError(message: string, err?: unknown) {
  console.log(`%c \u274C ${message}`, LOG_STYLES.error);
  if (err) console.error(err);
}

function logDetail(label: string, value: string | number) {
  console.log(`%c    ${label}: %c${value}`, LOG_STYLES.dim, "color: #1F2937;");
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Run the full dubbing pipeline: extract → transcribe → translate → TTS → subtitles → compose.
 *
 * @param videoPath - Absolute path to the source video file.
 * @param targetLang - Target language code for translation and TTS.
 * @param onProgress - Callback fired at the start of each pipeline step.
 * @returns PipelineResult with final status and all intermediate artifacts.
 */
export async function runPipeline(
  videoPath: string,
  targetLang: SupportedLanguage,
  onProgress: (progress: PipelineProgress) => void,
  signal?: AbortSignal,
  onLog?: (entry: PipelineLogEntry) => void,
): Promise<PipelineResult> {
  const result: Partial<PipelineResult> = {
    projectId: crypto.randomUUID(),
    sourceLanguage: "",
    targetLanguage: targetLang,
    segments: [],
    originalVideoPath: videoPath,
    status: "idle",
  };

  // Log buffer — written to file at the end (success or error)
  const logLines: string[] = [`=== Pipeline Log: ${new Date().toLocaleString("ko-KR")} ===`];
  let logFilePath: string | null = null;
  try {
    const _dataDir = await appLocalDataDir();
    const pipeDir = await join(_dataDir, "pipeline");
    const pdExists = await exists("pipeline", { baseDir: BaseDirectory.AppLocalData });
    if (!pdExists) await mkdir("pipeline", { baseDir: BaseDirectory.AppLocalData, recursive: true });
    logFilePath = await join(pipeDir, "pipeline.log");
  } catch { /* non-critical */ }

  const flushLog = async () => {
    if (logFilePath) {
      try { await writeFile(logFilePath, new TextEncoder().encode(logLines.join("\n") + "\n")); }
      catch { /* non-critical */ }
    }
  };

  const emitLog = (level: PipelineLogEntry['level'], message: string) => {
    onLog?.({ timestamp: Date.now(), level, message });
    const ts = new Date().toLocaleTimeString("ko-KR");
    const tag = level.toUpperCase().padEnd(7);
    logLines.push(`[${ts}] ${tag} ${message}`);
  };

  try {
    console.log("%c \uD83C\uDFAC Pipeline Started", LOG_STYLES.header);
    logDetail("Video", videoPath);
    logDetail("Target Language", targetLang);
    emitLog('info', '🎬 파이프라인 시작');
    emitLog('detail', `영상: ${videoPath}`);
    emitLog('detail', `대상 언어: ${targetLang}`);

    // Helper: check if cancelled between steps
    const checkCancelled = () => {
      if (signal?.aborted) throw new Error("파이프라인이 취소되었습니다.");
    };
    logStep(0, 6, "\uD83C\uDFB5", "\uC74C\uC131 \uCD94\uCD9C");
    emitLog('info', '[1/6] 음성 추출 시작');
    // ── Step 1: Extract audio ──────────────────────────────────────────────────
    onProgress({
      step: "extracting",
      stepIndex: 0,
      totalSteps: 6,
      message: "음성을 추출하는 중...",
    });
    result.status = "transcribing";
    const audioPath = await extractAudio(videoPath);
    logSuccess("Audio extracted", audioPath);
    emitLog('success', `✅ 음성 추출 완료 (경로: ${audioPath})`);

    checkCancelled();
    logStep(1, 6, "\uD83C\uDF99\uFE0F", "\uC74C\uC131 \uC778\uC2DD (Whisper)");
    emitLog('info', '[2/6] 음성 인식 시작 (Whisper)');
    // ── Step 2: Transcribe (upload audio to backend) ───────────────────────────
    onProgress({
      step: "transcribing",
      stepIndex: 1,
      totalSteps: 6,
      message: "음성을 인식하는 중...",
    });
    const audioData = await readFile(audioPath);
    const formData = new FormData();
    formData.append("file", new Blob([audioData]), "audio.mp3");
    const transcribeRes = await api.post(
      "/api/v1/pipeline/transcribe",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    const { segments: rawSegments, detected_language } = transcribeRes.data;
    result.sourceLanguage = detected_language;
    logSuccess("Transcription complete");
    logDetail("Language detected", detected_language);
    logDetail("Segments", rawSegments.length);
    emitLog('success', '✅ 음성 인식 완료');
    emitLog('detail', `감지 언어: ${detected_language}, 세그먼트 수: ${rawSegments.length}`);
    for (const seg of rawSegments) {
      emitLog('detail', `  📝 [${seg.start_time.toFixed(1)}s~${seg.end_time.toFixed(1)}s] ${seg.text}`);
    }

    checkCancelled();
    logStep(2, 6, "\uD83C\uDF10", "\uBC88\uC5ED (GPT)");
    emitLog('info', '[3/6] 번역 시작 (GPT)');
    // ── Step 3: Translate (on raw Whisper segments, BEFORE splitting) ─────────
    onProgress({
      step: "translating",
      stepIndex: 2,
      totalSteps: 6,
      message: "번역하는 중...",
    });
    result.status = "translating";
    const translateRes = await withRetry(
      () => api.post("/api/v1/pipeline/translate", {
        segments: rawSegments,
        source_language: detected_language,
        target_language: targetLang,
      }),
      '번역(translate)',
      emitLog,
    );
    const translatedSegments = translateRes.data.segments;
    logSuccess("Translation complete");
    logDetail("Segments translated", translatedSegments.length);
    emitLog('success', '✅ 번역 완료');
    emitLog('detail', `번역 세그먼트: ${translatedSegments.length}개`);
    for (const seg of translatedSegments) {
      emitLog('detail', `  🔄 ${seg.original_text} → ${seg.translated_text}`);
    }

    // Subtitle segments will be created AFTER TTS via Whisper realignment
    // (moved from here to Step 5 for accurate audio-synced timing)

    checkCancelled();
    logStep(3, 6, "\uD83D\uDD0A", "AI \uC74C\uC131 \uC0DD\uC131 (TTS)");
    emitLog('info', '[4/6] AI 음성 생성 시작 (TTS)');
    // ── Step 4: Synthesize TTS (limited concurrency) ───────────────────────────
    onProgress({
      step: "synthesizing",
      stepIndex: 3,
      totalSteps: 6,
      message: "AI 음성을 생성하는 중...",
    });
    result.status = "synthesizing";
    const dataDir = await appLocalDataDir();
    const ttsDir = await join(dataDir, "pipeline", "tts");
    const tdExists = await exists("pipeline/tts", {
      baseDir: BaseDirectory.AppLocalData,
    });
    if (!tdExists) {
      await mkdir("pipeline/tts", {
        baseDir: BaseDirectory.AppLocalData,
        recursive: true,
      });
    }

    const voicesRes = await api.get(
      `/api/v1/pipeline/voices?language=${targetLang}`,
    );
    const defaultVoice = voicesRes.data.voices[0];

    const pipelineSegments: PipelineSegment[] = [];
    const TTS_CONCURRENCY = 2; // Keep low to avoid overwhelming the server
    const TTS_RETRIES = 2;
    for (let i = 0; i < translatedSegments.length; i += TTS_CONCURRENCY) {
      checkCancelled();
      const batch = translatedSegments.slice(i, i + TTS_CONCURRENCY);
      emitLog('detail', `  \uD83D\uDD0A TTS ${i + 1}-${i + batch.length} / ${translatedSegments.length}`);
      const batchResults = await Promise.all(
        batch.map(async (seg: any, batchIdx: number) => {
          const idx = i + batchIdx;
          let lastErr: any;
          for (let attempt = 0; attempt <= TTS_RETRIES; attempt++) {
            try {
              const ttsRes = await api.post(
                '/api/v1/pipeline/synthesize',
                {
                  text: seg.translated_text,
                  voice_id: defaultVoice.voice_id,
                  language: targetLang,
                  speed: 1.0,
                },
                { responseType: 'arraybuffer', timeout: 30_000 },
              );

              const ttsPath = await join(ttsDir, `tts_${idx}.mp3`);
              await writeFile(ttsPath, new Uint8Array(ttsRes.data));

              return {
                id: seg.id,
                startTime: seg.start_time,
                endTime: seg.end_time,
                originalText: seg.original_text || seg.text,
                translatedText: seg.translated_text,
                ttsAudioPath: ttsPath,
                voiceId: defaultVoice.voice_id,
                voiceName: defaultVoice.name,
              } as PipelineSegment;
            } catch (err: any) {
              lastErr = err;
              const isNetwork = !err.response; // Network Error = no response at all
              if (isNetwork && attempt < TTS_RETRIES) {
                emitLog('detail', `  \u26A0\uFE0F TTS #${idx} \uB124\uD2B8\uC6CC\uD06C \uC624\uB958, ${attempt + 1}\uBC88\uC9F8 \uC7AC\uC2DC\uB3C4...`);
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                continue;
              }
              throw err;
            }
          }
          throw lastErr; // should not reach here
        }),
      );
      pipelineSegments.push(...batchResults);
    }
    result.segments = pipelineSegments;
    logSuccess("TTS synthesis complete");
    logDetail("Voice", defaultVoice.name);
    logDetail("Audio files", pipelineSegments.length.toString());
    emitLog('success', '✅ AI 음성 생성 완료');
    emitLog('detail', `음성: ${defaultVoice.name}, 파일 수: ${pipelineSegments.length}`);

    // ── Verify all TTS files exist before continuing ──────────────────────────
    const missingTts: string[] = [];
    for (const seg of pipelineSegments) {
      if (!seg.ttsAudioPath) {
        missingTts.push(`segment ${seg.id}: 경로 없음`);
        continue;
      }
      const ttsFileExists = await exists(seg.ttsAudioPath);
      if (!ttsFileExists) {
        missingTts.push(seg.ttsAudioPath);
      }
    }
    if (missingTts.length > 0) {
      throw new Error(
        `TTS 파일 검증 실패 (${missingTts.length}개 누락):\n${missingTts.join("\n")}`,
      );
    }

    checkCancelled();
    logStep(4, 6, "\uD83C\uDF99\uFE0F", "\uC790\uB9C9 \uC815\uB82C (Whisper)");
    emitLog('info', '[5/6] 자막 정렬 시작 (Whisper)');
    // ── Step 5: Realign subtitles via Whisper word-level timestamps ────────────
    onProgress({
      step: "realigning",
      stepIndex: 4,
      totalSteps: 6,
      message: "자막을 음성에 정렬하는 중...",
    });

    let subtitleSegmentsResult: SubtitleSegment[] = [];
    const REALIGN_CONCURRENCY = 3;
    try {
      // Re-transcribe each TTS audio to get word-level timestamps
      for (let i = 0; i < pipelineSegments.length; i += REALIGN_CONCURRENCY) {
        checkCancelled();
        const batch = pipelineSegments.slice(i, i + REALIGN_CONCURRENCY);
        emitLog('detail', `  \uD83C\uDF99\uFE0F 정렬 ${i + 1}-${i + batch.length} / ${pipelineSegments.length}`);

        const batchResults = await Promise.all(
          batch.map(async (seg) => {
            if (!seg.ttsAudioPath) return [];

            const ttsAudioData = await readFile(seg.ttsAudioPath);
            const realignForm = new FormData();
            realignForm.append("file", new Blob([ttsAudioData]), "tts_audio.mp3");

            const realignRes = await withRetry(
              () => api.post("/api/v1/pipeline/realign", realignForm, {
                headers: { "Content-Type": "multipart/form-data" },
              }),
              `자막 정렬(realign #${seg.id})`,
              emitLog,
            );

            const words = realignRes.data.words;
            if (!words || words.length === 0) return [];

            return createSubtitlesFromWords(
              words,
              seg.startTime,
              seg.endTime,
              seg.id,
              seg.originalText,
              { maxLines: 2, maxDuration: 2 },
            );
          }),
        );

        for (const segSubs of batchResults) {
          subtitleSegmentsResult.push(...segSubs.map((s) => ({
            id: s.id,
            startTime: s.startTime,
            endTime: s.endTime,
            originalText: s.originalText,
            translatedText: s.translatedText,
          } as SubtitleSegment)));
        }
      }

      emitLog('success', `\u2705 \uc790\ub9c9 \uc815\ub82c \uc644\ub8cc (${subtitleSegmentsResult.length}\uac1c \uc790\ub9c9)`);
      for (const sub of subtitleSegmentsResult) {
        emitLog('detail', `  \uD83C\uDF99\uFE0F [${sub.startTime.toFixed(1)}s~${sub.endTime.toFixed(1)}s] ${sub.translatedText}`);
      }
    } catch (realignErr: any) {
      // Fallback: GPT split or algorithmic split
      emitLog('error', `\uD83C\uDF99\uFE0F \uc790\ub9c9 \uc815\ub82c \uc2e4\ud328, GPT \ubd84\ud560\ub85c \ub300\uccb4: ${realignErr.message}`);
      try {
        const splitRes = await withRetry(
          () => api.post("/api/v1/pipeline/split-segments", {
            segments: translatedSegments,
            max_duration: 2.0,
            max_lines: 2,
            target_language: targetLang,
          }),
          '\uc790\ub9c9 \ubd84\ud560(split-segments)',
          emitLog,
        );
        subtitleSegmentsResult = splitRes.data.segments.map((s: any) => ({
          id: s.id,
          startTime: s.start_time,
          endTime: s.end_time,
          originalText: s.original_text,
          translatedText: s.translated_text,
        } as SubtitleSegment));
      } catch (splitErr: any) {
        emitLog('error', `\u2702\uFE0F GPT \ubd84\ud560\ub3c4 \uc2e4\ud328, \uc54c\uace0\ub9ac\uc998 \ubd84\ud560\ub85c \ub300\uccb4: ${splitErr.message}`);
        const segmentsToSplit = translatedSegments.map((seg: any) => ({
          ...seg,
          text: seg.translated_text,
        }));
        const fallbackSplit = splitLongSegments(segmentsToSplit, { maxLines: 3, maxDuration: 2 });
        subtitleSegmentsResult = fallbackSplit.map((seg) => ({
          id: seg.id ?? '0',
          startTime: seg.start_time,
          endTime: seg.end_time,
          originalText: (seg as any).original_text ?? '',
          translatedText: (seg as any).translated_text ?? seg.text,
        } as SubtitleSegment));
      }
    }
    result.subtitleSegments = subtitleSegmentsResult;

    checkCancelled();
    logStep(5, 6, "\uD83C\uDFB5", "\uC74C\uC131 \uD2B8\uB799 \uBCD1\uD569");
    emitLog('info', '[6/6] 음성 트랙 병합 시작');
    // ── Step 6: Merge TTS audio into single track (NO video composition) ──────
    onProgress({
      step: "merging_tts",
      stepIndex: 5,
      totalSteps: 6,
      message: "음성 트랙을 병합하는 중...",
    });
    result.status = "composing";
    const ttsSegments = pipelineSegments
      .filter((s) => s.ttsAudioPath)
      .map((s) => ({
        audioPath: s.ttsAudioPath!,
        startTime: s.startTime,
        endTime: s.endTime,
      }));
    // dataDir already declared in Step 4
    const mergedTtsPath = await mergeTtsAudio(dataDir, ttsSegments);
    result.mergedTtsPath = mergedTtsPath;
    result.status = "done";
    logSuccess("TTS audio merged", mergedTtsPath);
    console.log("%c \uD83C\uDF89 Pipeline Complete!", LOG_STYLES.header);
    emitLog('success', `✅ 음성 트랙 병합 완료 (경로: ${mergedTtsPath})`);
    emitLog('success', '🎉 파이프라인 완료!');

    // Flush logs (do NOT cleanup pipeline files — TTS MP3s needed for preview)
    await flushLog();
    return result as PipelineResult;
  } catch (error: any) {
    // Extract backend error detail from axios response (if available)
    const backendDetail: string | undefined = error.response?.data?.detail;
    const statusCode: number | undefined = error.response?.status;
    // Tauri plugin errors are often strings, not Error objects
    const rawMessage = typeof error === 'string'
      ? error
      : (error.message || String(error));
    const errorMessage = backendDetail
      ? `[${statusCode}] ${backendDetail}`
      : rawMessage || '알 수 없는 오류';

    logError('Pipeline failed', error);
    emitLog('error', `❌ 파이프라인 실패: ${errorMessage}`);
    emitLog('detail', `에러 타입: ${typeof error}, 전체: ${JSON.stringify(error, null, 2)}`);
    if (backendDetail) {
      emitLog('detail', `서버 응답: ${backendDetail}`);
    }
    if (error.response?.data) {
      emitLog('detail', `응답 데이터: ${JSON.stringify(error.response.data)}`);
    }

    const isCancelled = signal?.aborted || error.message?.includes('취소');
    result.status = 'error';
    result.error = isCancelled
      ? '파이프라인이 취소되었습니다.'
      : errorMessage;

    // Flush logs & cleanup all files on error/cancel (clean slate)
    await flushLog();
    await cleanupPipeline(false);

    return result as PipelineResult;
  }
}
