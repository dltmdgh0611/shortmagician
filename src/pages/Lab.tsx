import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Check,
  X,
  Music,
  Mic,
  Globe,
  Scissors,
  Volume2,
  FileText,
  Film,
  RotateCcw,
  ArrowRight,
} from "lucide-react";
import { callTranscribe, callTranslate, callSynthesize, callVoices, callSplitSegments } from "../lib/cloudFunctions";
import { resetCredits } from "../lib/services/creditService";
import { useAuth } from "../contexts/AuthContext";
import { extractAudio } from "../lib/pipeline/audioExtractor";
import { generateSubtitles } from "../lib/pipeline/subtitleGenerator";
import { composeVideo } from "../lib/pipeline/videoComposer";
import {
  displayWidth,
  estimateLines,
  MAX_LINE_WIDTH,
} from "../lib/pipeline/segmentSplitter";
import {
  readFile,
  writeFile,
  exists,
  mkdir,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join, resolveResource } from "@tauri-apps/api/path";

// ── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "idle" | "running" | "done" | "error";

interface StepState {
  status: StepStatus;
  error: string | null;
  elapsed: number | null;
}

interface TranscribeSegment {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
}

interface TranslatedSegment {
  id: string;
  start_time: number;
  end_time: number;
  original_text: string;
  translated_text: string;
}

const INIT: StepState = { status: "idle", error: null, elapsed: null };

const LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "es", label: "Español" },
];

function extractError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      response?: { data?: { detail?: string } };
      message?: string;
    };
    if (e.response?.data?.detail) return e.response.data.detail;
    if (e.message) return e.message;
  }
  return "알 수 없는 오류";
}

// ── Main Component ───────────────────────────────────────────────────────────

export function Lab() {
  const navigate = useNavigate();
  const { state } = useAuth();

  // ── Video path ──
  const [videoPath, setVideoPath] = useState("test.mp4");

  // ── Credit reset ──
  const [creditResetting, setCreditResetting] = useState(false);
  const [creditMsg, setCreditMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Step states ──
  const [step1, setStep1] = useState<StepState>(INIT);
  const [step2, setStep2] = useState<StepState>(INIT);
  const [step3, setStep3] = useState<StepState>(INIT);
  const [step4, setStep4] = useState<StepState>(INIT);
  const [step5, setStep5] = useState<StepState>(INIT);
  const [step6, setStep6] = useState<StepState>(INIT);
  const [step7, setStep7] = useState<StepState>(INIT);

  // ── Step results ──
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [transcribeResult, setTranscribeResult] = useState<{
    segments: TranscribeSegment[];
    detected_language: string;
  } | null>(null);
  const [targetLang, setTargetLang] = useState("ko");
  const [translateResult, setTranslateResult] = useState<
    TranslatedSegment[] | null
  >(null);
  const [splitMaxLines, setSplitMaxLines] = useState(2);
  const [splitMaxDuration, setSplitMaxDuration] = useState(2.0);
  const [splitResult, setSplitResult] = useState<TranslatedSegment[] | null>(
    null,
  );
  const [ttsResult, setTtsResult] = useState<{
    count: number;
    paths: string[];
  } | null>(null);
  const [subtitlePath, setSubtitlePath] = useState<string | null>(null);
  const [composedPath, setComposedPath] = useState<string | null>(null);

  // ── Step 1: Extract Audio ──────────────────────────────────────────────────

  const handleExtract = useCallback(async () => {
    setStep1({ status: "running", error: null, elapsed: null });
    const start = performance.now();
    try {
      const path = await extractAudio(videoPath);
      setAudioPath(path);
      setStep1({
        status: "done",
        error: null,
        elapsed: (performance.now() - start) / 1000,
      });
    } catch (err) {
      setStep1({
        status: "error",
        error: extractError(err),
        elapsed: (performance.now() - start) / 1000,
      });
    }
  }, [videoPath]);

  // ── Step 2: Transcribe ─────────────────────────────────────────────────────

  const handleTranscribe = useCallback(async () => {
    if (!audioPath) return;
    setStep2({ status: "running", error: null, elapsed: null });
    const start = performance.now();
    try {
      const audioData = await readFile(audioPath);
      let binary = '';
      for (let i = 0; i < audioData.length; i++) binary += String.fromCharCode(audioData[i]);
      const audioBase64 = btoa(binary);
      const res = await callTranscribe({ audioBase64, filename: "audio.mp3" });
      setTranscribeResult(res);
      setStep2({
        status: "done",
        error: null,
        elapsed: (performance.now() - start) / 1000,
      });
    } catch (err) {
      setStep2({
        status: "error",
        error: extractError(err),
        elapsed: (performance.now() - start) / 1000,
      });
    }
  }, [audioPath]);

  // ── Step 3: Translate ──────────────────────────────────────────────────────

  const handleTranslate = useCallback(async () => {
    if (!transcribeResult) return;
    setStep3({ status: "running", error: null, elapsed: null });
    const start = performance.now();
    try {
      const res = await callTranslate({
        segments: transcribeResult.segments,
        source_language: transcribeResult.detected_language,
        target_language: targetLang,
      });
      setTranslateResult(res.segments);
      setStep3({
        status: "done",
        error: null,
        elapsed: (performance.now() - start) / 1000,
      });
    } catch (err) {
      setStep3({
        status: "error",
        error: extractError(err),
        elapsed: (performance.now() - start) / 1000,
      });
    }
  }, [transcribeResult, targetLang]);

  // ── Step 4: Split Segments ⭐ ──────────────────────────────────────────────

  const handleSplit = useCallback(async () => {
    if (!translateResult) return;
    setStep4({ status: "running", error: null, elapsed: null });
    const start = performance.now();
    try {
      const res = await callSplitSegments({
        segments: translateResult,
        max_duration: splitMaxDuration,
        max_lines: splitMaxLines,
        target_language: targetLang,
      });
      setSplitResult(res.segments);
      setStep4({
        status: "done",
        error: null,
        elapsed: (performance.now() - start) / 1000,
      });
    } catch (err) {
      setStep4({
        status: "error",
        error: extractError(err),
        elapsed: (performance.now() - start) / 1000,
      });
    }
  }, [translateResult, splitMaxDuration, splitMaxLines, targetLang]);

  // ── Step 5: TTS Synthesis ──────────────────────────────────────────────────

  const handleTts = useCallback(async () => {
    if (!translateResult) return;
    setStep5({ status: "running", error: null, elapsed: null });
    const start = performance.now();
    try {
      const voicesRes = await callVoices({ language: targetLang });
      const defaultVoice = voicesRes.voices[0];

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

      const paths: string[] = [];
      for (let i = 0; i < translateResult.length; i++) {
        const seg = translateResult[i];
        const ttsRes = await callSynthesize({
          text: seg.translated_text,
          voice_id: defaultVoice.voice_id,
          language: targetLang,
          speed: 1.0,
        });
        const ttsPath = await join(ttsDir, `tts_${i}.mp3`);
        const binaryStr = atob(ttsRes.audioBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let j = 0; j < binaryStr.length; j++) bytes[j] = binaryStr.charCodeAt(j);
        await writeFile(ttsPath, bytes);
        paths.push(ttsPath);
      }

      setTtsResult({ count: paths.length, paths });
      setStep5({
        status: "done",
        error: null,
        elapsed: (performance.now() - start) / 1000,
      });
    } catch (err) {
      setStep5({
        status: "error",
        error: extractError(err),
        elapsed: (performance.now() - start) / 1000,
      });
    }
  }, [translateResult, targetLang]);

  // ── Step 6: Generate Subtitles ─────────────────────────────────────────────

  const handleSubtitles = useCallback(async () => {
    if (!splitResult) return;
    setStep6({ status: "running", error: null, elapsed: null });
    const start = performance.now();
    try {
      const fontDir = await resolveResource("resources/fonts");
      const subtitleData = splitResult.map((s) => ({
        text: s.translated_text,
        startTime: s.start_time,
        endTime: s.end_time,
      }));
      const path = await generateSubtitles(subtitleData, fontDir);
      setSubtitlePath(path);
      setStep6({
        status: "done",
        error: null,
        elapsed: (performance.now() - start) / 1000,
      });
    } catch (err) {
      setStep6({
        status: "error",
        error: extractError(err),
        elapsed: (performance.now() - start) / 1000,
      });
    }
  }, [splitResult]);

  // ── Step 7: Compose Video ──────────────────────────────────────────────────

  const handleCompose = useCallback(async () => {
    if (!ttsResult || !subtitlePath || !translateResult) return;
    setStep7({ status: "running", error: null, elapsed: null });
    const start = performance.now();
    try {
      const ttsSegments = translateResult.map((s, i) => ({
        audioPath: ttsResult.paths[i],
        startTime: s.start_time,
        endTime: s.end_time,
      }));
      const path = await composeVideo(videoPath, ttsSegments);
      setComposedPath(path);
      setStep7({
        status: "done",
        error: null,
        elapsed: (performance.now() - start) / 1000,
      });
    } catch (err) {
      setStep7({
        status: "error",
        error: extractError(err),
        elapsed: (performance.now() - start) / 1000,
      });
    }
  }, [ttsResult, subtitlePath, translateResult, videoPath]);

  // ── Credit Reset ──────────────────────────────────────────────────────────

  const handleCreditReset = useCallback(async () => {
    setCreditResetting(true);
    setCreditMsg(null);
    try {
      const res = await resetCredits(state.user!.uid);
      setCreditMsg({ type: "success", text: `크레닷 초기화 완료! (남은 크레닷: ${res.remaining}/${res.daily_limit})` });
    } catch (err) {
      setCreditMsg({ type: "error", text: extractError(err) });
    } finally {
      setCreditResetting(false);
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          설정으로 돌아가기
        </button>
        <h2 className="text-2xl font-bold text-gray-900">🧪 실험실</h2>
        <p className="text-sm text-gray-500 mt-1">
          파이프라인 각 단계를 수동으로 테스트합니다
        </p>
      </div>

      {/* Credit Reset */}
      <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <label className="block text-sm font-semibold text-gray-500 mb-2">
          크레닷 초기화
        </label>
        <p className="text-xs text-gray-400 mb-3">
          오늘 사용한 크레닷을 초기화합니다 (테스트용)
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCreditReset}
            disabled={creditResetting}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
          >
            {creditResetting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCcw size={14} />
            )}
            크레닷 초기화
          </button>
          {creditMsg && (
            <span className={`text-xs font-medium ${creditMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {creditMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* Video Path Input */}
      <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <label className="block text-sm font-semibold text-gray-500 mb-2">
          영상 파일 경로
        </label>
        <input
          type="text"
          value={videoPath}
          onChange={(e) => setVideoPath(e.target.value)}
          placeholder="test.mp4 절대 경로를 입력하세요"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors font-mono"
        />
      </div>

      <div className="space-y-6">
        {/* ── Step 1: Extract Audio ────────────────────────────────────────── */}
        <StepSection
          stepNum={1}
          icon={<Music size={14} />}
          title="음성 추출"
          desc="영상에서 16kHz 모노 MP3 오디오를 추출합니다 (FFmpeg)."
          state={step1}
          onRun={handleExtract}
          disabled={!videoPath.trim()}
        >
          {step1.status === "done" && audioPath && (
            <ResultArea variant="success">
              <span className="font-mono text-xs break-all">{audioPath}</span>
            </ResultArea>
          )}
        </StepSection>

        {/* ── Step 2: Transcribe ──────────────────────────────────────────── */}
        <StepSection
          stepNum={2}
          icon={<Mic size={14} />}
          title="음성 인식 (Whisper)"
          desc="오디오를 텍스트로 변환합니다."
          state={step2}
          onRun={handleTranscribe}
          disabled={!audioPath}
        >
          {step2.status === "done" && transcribeResult && (
            <ResultArea variant="success">
              <p className="text-xs text-green-600 mb-2">
                감지 언어:{" "}
                <span className="font-semibold">
                  {transcribeResult.detected_language}
                </span>
                {" · "}세그먼트:{" "}
                <span className="font-semibold">
                  {transcribeResult.segments.length}개
                </span>
              </p>
              <div className="space-y-1">
                {transcribeResult.segments.map((seg, i) => (
                  <div
                    key={seg.id}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span className="text-green-400 shrink-0 w-5 text-right">
                      {i + 1}
                    </span>
                    <span className="text-green-500 shrink-0 font-mono text-[10px]">
                      {seg.start_time.toFixed(1)}s~{seg.end_time.toFixed(1)}s
                    </span>
                    <span className="text-green-800">{seg.text}</span>
                  </div>
                ))}
              </div>
            </ResultArea>
          )}
        </StepSection>

        {/* ── Step 3: Translate ───────────────────────────────────────────── */}
        <StepSection
          stepNum={3}
          icon={<Globe size={14} />}
          title="번역 (GPT-4o)"
          desc="Whisper 세그먼트를 번역합니다 (문단 단위 = TTS용)."
          state={step3}
          onRun={handleTranslate}
          disabled={!transcribeResult}
          controls={
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          }
        >
          {step3.status === "done" && translateResult && (
            <ResultArea variant="success">
              <p className="text-xs text-green-600 mb-2">
                번역 세그먼트:{" "}
                <span className="font-semibold">
                  {translateResult.length}개
                </span>
              </p>
              <div className="space-y-2">
                {translateResult.map((seg, i) => {
                  const w = displayWidth(seg.translated_text);
                  const lines = estimateLines(seg.translated_text);
                  return (
                    <div
                      key={`${seg.id}-${i}`}
                      className="text-xs border-l-2 border-green-200 pl-3"
                    >
                      <div className="text-green-400 font-mono text-[10px] mb-0.5">
                        [{seg.start_time.toFixed(1)}s~{seg.end_time.toFixed(1)}s]
                        폭={w} 줄={lines}
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-600 break-all">
                          {seg.original_text}
                        </span>
                        <ArrowRight
                          size={10}
                          className="text-green-300 shrink-0 mt-0.5"
                        />
                        <span className="text-green-800 font-medium break-all">
                          {seg.translated_text}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ResultArea>
          )}
        </StepSection>

        {/* ── Step 4: Split Segments ⭐ ───────────────────────────────────── */}
        <StepSection
          stepNum={4}
          icon={<Scissors size={14} />}
          title="자막 분할 (GPT-4o-mini) ⭐"
          desc="번역 세그먼트를 자막용 짧은 문장으로 분할합니다. 파라미터를 바꿔가며 재실행 가능!"
          state={step4}
          onRun={handleSplit}
          disabled={!translateResult}
          controls={
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                최대 줄수
                <input
                  type="number"
                  value={splitMaxLines}
                  onChange={(e) => setSplitMaxLines(Number(e.target.value))}
                  min={1}
                  max={5}
                  className="w-12 px-1.5 py-1 text-xs border border-gray-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                최대 초
                <input
                  type="number"
                  value={splitMaxDuration}
                  onChange={(e) =>
                    setSplitMaxDuration(Number(e.target.value))
                  }
                  min={0.5}
                  max={5}
                  step={0.5}
                  className="w-14 px-1.5 py-1 text-xs border border-gray-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <span className="text-[10px] text-gray-400 font-mono">
                max_width = {splitMaxLines} × {MAX_LINE_WIDTH} ={" "}
                {splitMaxLines * MAX_LINE_WIDTH}
              </span>
            </div>
          }
        >
          {step4.status === "done" && splitResult && translateResult && (
            <ResultArea variant="success">
              {/* ── Summary ── */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-green-200">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-gray-600">
                    {translateResult.length}개
                  </span>
                  <ArrowRight size={14} className="text-green-500" />
                  <span className="px-2.5 py-1 bg-green-100 rounded-lg text-green-700">
                    {splitResult.length}개
                  </span>
                </div>
                <span className="text-xs text-green-500 font-medium">
                  ×{(splitResult.length / translateResult.length).toFixed(1)}
                </span>
              </div>

              {/* ── Before: Translated (paragraph) ── */}
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-green-600 mb-2">
                  📝 분할 전 (문단 단위 — {translateResult.length}개)
                </h4>
                <div className="space-y-1">
                  {translateResult.map((seg, i) => {
                    const w = displayWidth(seg.translated_text);
                    const maxW = splitMaxLines * MAX_LINE_WIDTH;
                    return (
                      <div
                        key={`before-${i}`}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span className="text-green-400 w-4 text-right shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-green-800 flex-1 break-all">
                          {seg.translated_text}
                        </span>
                        <span
                          className={`shrink-0 font-mono text-[10px] ${w > maxW ? "text-red-500 font-bold" : "text-green-400"}`}
                        >
                          폭{w}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── After: Split (sentence) ── */}
              <div>
                <h4 className="text-xs font-semibold text-green-600 mb-2">
                  ✂️ 분할 후 (문장 단위 — {splitResult.length}개)
                </h4>
                <div className="space-y-1.5">
                  {splitResult.map((seg, i) => {
                    const w = displayWidth(seg.translated_text);
                    const maxW = splitMaxLines * MAX_LINE_WIDTH;
                    const lines = estimateLines(seg.translated_text);
                    const dur = seg.end_time - seg.start_time;
                    const widthPct = Math.min(100, (w / maxW) * 100);
                    const isOver = w > maxW;
                    const isWarn = !isOver && w > maxW * 0.8;

                    return (
                      <div key={`after-${i}`} className="text-xs">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-green-400 w-4 text-right shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-green-800 flex-1 break-all">
                            {seg.translated_text}
                          </span>
                          <span
                            className={`shrink-0 font-mono text-[10px] whitespace-nowrap ${
                              isOver
                                ? "text-red-500 font-bold"
                                : isWarn
                                  ? "text-amber-500"
                                  : "text-green-400"
                            }`}
                          >
                            {w}/{maxW} · {lines}줄 · {dur.toFixed(1)}s
                          </span>
                        </div>
                        {/* Width bar */}
                        <div className="ml-6 flex items-center gap-1">
                          <div className="flex-1 h-1.5 bg-green-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isOver
                                  ? "bg-red-400"
                                  : isWarn
                                    ? "bg-amber-400"
                                    : "bg-green-400"
                              }`}
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Stats ── */}
              <div className="mt-4 pt-3 border-t border-green-200 text-[10px] font-mono text-green-500 space-y-0.5">
                <div>
                  MAX_LINE_WIDTH={MAX_LINE_WIDTH} · max_lines={splitMaxLines} ·
                  max_width={splitMaxLines * MAX_LINE_WIDTH} · max_duration=
                  {splitMaxDuration}s
                </div>
                <div>
                  평균 폭:{" "}
                  {(
                    splitResult.reduce(
                      (sum, s) => sum + displayWidth(s.translated_text),
                      0,
                    ) / splitResult.length
                  ).toFixed(1)}{" "}
                  · 최대 폭:{" "}
                  {Math.max(
                    ...splitResult.map((s) => displayWidth(s.translated_text)),
                  )}{" "}
                  · 초과:{" "}
                  {
                    splitResult.filter(
                      (s) =>
                        displayWidth(s.translated_text) >
                        splitMaxLines * MAX_LINE_WIDTH,
                    ).length
                  }
                  개
                </div>
              </div>
            </ResultArea>
          )}
        </StepSection>

        {/* ── Step 5: TTS ─────────────────────────────────────────────────── */}
        <StepSection
          stepNum={5}
          icon={<Volume2 size={14} />}
          title="TTS 합성 (Google Cloud)"
          desc="번역된 문단을 AI 음성으로 합성합니다 (문단 단위)."
          state={step5}
          onRun={handleTts}
          disabled={!translateResult}
        >
          {step5.status === "done" && ttsResult && (
            <ResultArea variant="success">
              <p className="text-xs text-green-800">
                ✅ {ttsResult.count}개 음성 파일 생성 완료
              </p>
            </ResultArea>
          )}
        </StepSection>

        {/* ── Step 6: Subtitles ───────────────────────────────────────────── */}
        <StepSection
          stepNum={6}
          icon={<FileText size={14} />}
          title="자막 생성 (Rust)"
          desc="분할된 자막 세그먼트로 ASS 자막 파일을 생성합니다."
          state={step6}
          onRun={handleSubtitles}
          disabled={!splitResult}
        >
          {step6.status === "done" && subtitlePath && (
            <ResultArea variant="success">
              <span className="font-mono text-xs break-all">{subtitlePath}</span>
            </ResultArea>
          )}
        </StepSection>

        {/* ── Step 7: Compose ─────────────────────────────────────────────── */}
        <StepSection
          stepNum={7}
          icon={<Film size={14} />}
          title="영상 합성 (FFmpeg)"
          desc="원본 영상 + TTS 음성 + 자막을 합성합니다."
          state={step7}
          onRun={handleCompose}
          disabled={!ttsResult || !subtitlePath}
        >
          {step7.status === "done" && composedPath && (
            <ResultArea variant="success">
              <span className="font-mono text-xs break-all">
                {composedPath}
              </span>
            </ResultArea>
          )}
        </StepSection>
      </div>
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────────────

function StepSection({
  stepNum,
  icon,
  title,
  desc,
  state,
  onRun,
  disabled,
  controls,
  children,
}: {
  stepNum: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  state: StepState;
  onRun: () => void;
  disabled?: boolean;
  controls?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 text-xs font-bold rounded-full">
          {stepNum}
        </span>
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {state.status === "done" && (
          <Check size={14} className="text-green-500 ml-auto" />
        )}
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-500">{desc}</p>
        {controls && <div>{controls}</div>}
        <div className="flex items-center gap-3">
          <button
            onClick={onRun}
            disabled={disabled || state.status === "running"}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
          >
            {state.status === "running" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : state.status === "done" ? (
              <RotateCcw size={14} />
            ) : (
              icon
            )}
            {state.status === "done" ? "재실행" : "실행"}
          </button>
          <StatusBadge status={state.status} elapsed={state.elapsed} />
        </div>
        {state.status === "error" && state.error && (
          <ResultArea variant="error">{state.error}</ResultArea>
        )}
        {children}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  elapsed,
}: {
  status: StepStatus;
  elapsed: number | null;
}) {
  if (status === "idle" || status === "running") return null;

  const time = elapsed !== null ? ` (${elapsed.toFixed(1)}s)` : "";

  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 border border-green-200 rounded-lg text-xs font-medium text-green-600">
        <Check size={12} />
        완료{time}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-600">
      <X size={12} />
      실패{time}
    </span>
  );
}

function ResultArea({
  variant,
  children,
}: {
  variant: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mt-3 p-4 rounded-xl text-sm ${
        variant === "success"
          ? "bg-green-50 border border-green-200 text-green-800"
          : "bg-red-50 border border-red-200 text-red-600"
      }`}
    >
      {children}
    </div>
  );
}
