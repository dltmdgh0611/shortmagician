/**
 * Split transcription segments so that:
 *   1. Subtitle text ≤ `maxLines` lines  (display-width based)
 *   2. Duration ≤ `maxDuration` seconds   (time based)
 *
 * Uses CJK-aware character width matching the Rust subtitle renderer
 * (MAX_LINE_WIDTH = 28 units, CJK = 2 units, Latin = 1 unit).
 *
 * Split strategy (in order):
 *   a. Sentence boundaries  (.!?。！？…)
 *   b. Clause boundaries    (,;:，；：、)
 *   c. Space / character boundaries (last resort)
 *
 * Timing is distributed proportionally by display width.
 * All original segment fields (id, etc.) are preserved via spread.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_LINE_WIDTH = 20; // Must match Rust `wrap_subtitle_text` (font size 80)

// ── Width helpers ─────────────────────────────────────────────────────────────

function isWideChar(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0xff00 && code <= 0xffef) // Fullwidth Forms
  );
}

export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x20) continue; // skip control chars and spaces
    width += isWideChar(code) ? 2 : 1;
  }
  return width;
}

export function estimateLines(text: string): number {
  if (!text) return 0;
  return Math.ceil(displayWidth(text) / MAX_LINE_WIDTH);
}

// ── Korean grammar helpers ───────────────────────────────────────────────────

/**
 * Korean sentence-ending suffixes.
 * Matches word endings like 습니다, 했다, 세요, 요, 다, 죠, etc.
 */
const KO_SENTENCE_END =
  /(?:겠습니다|었습니다|았습니다|습니다|합니다|입니다|됩니다|거든요|잖아요|네요|군요|세요|에요|예요|겠다|았다|었다|했다|된다|한다|있다|없다|는다|다|요|까|네|죠)$/;

/**
 * Korean clause-connecting suffixes.
 * Matches word endings like 는데, 지만, 어서, 고, 면, 서, etc.
 */
const KO_CLAUSE_END =
  /(?:때문에|는데|지만|어서|니까|라서|으며|면서|도록|려고|든지|거나|고|면|서|며)$/;

// ── Text splitting ────────────────────────────────────────────────────────────

/** Split text at sentence-ending punctuation, keeping punctuation attached. */
function splitAtSentences(text: string): string[] {
  const parts = text.match(/[^.!?。！？…]+(?:[.!?。！？…]+\s*)?/g);
  if (!parts || parts.length <= 1) return [text];
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Split text at clause-level punctuation. */
function splitAtClauses(text: string): string[] {
  const parts = text.match(/[^,;:，；：、]+(?:[,;:，；：、]+\s*)?/g);
  if (!parts || parts.length <= 1) return [text];
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Split Korean text at natural grammatical boundaries.
 * Groups space-separated words into phrases, breaking after
 * sentence endings (다, 요, 습니다…) and clause connectors (고, 면, 서…).
 */
function splitAtKoreanGrammar(text: string): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 1) return [text];

  const phrases: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    if (KO_SENTENCE_END.test(word) || KO_CLAUSE_END.test(word)) {
      phrases.push(current.join(" "));
      current = [];
    }
  }

  // Leftover words: append to last phrase or create new one
  if (current.length > 0) {
    if (phrases.length > 0 && current.length <= 2) {
      // Short tail — merge with last phrase to avoid orphan fragments
      phrases[phrases.length - 1] += " " + current.join(" ");
    } else {
      phrases.push(current.join(" "));
    }
  }

  return phrases.length > 1 ? phrases : [text];
}

/** Split text at space boundaries (for Latin text without clause punctuation). */
function splitAtSpaces(text: string): string[] {
  const parts = text.split(/\s+/);
  if (parts.length <= 1) return [text];
  return parts.filter((s) => s.length > 0);
}

/** Group text fragments so each group's display width ≤ maxWidth. */
function groupByWidth(parts: string[], maxWidth: number): string[] {
  if (parts.length === 0) return [];

  const groups: string[] = [];
  let current = parts[0];

  for (let i = 1; i < parts.length; i++) {
    const combined = `${current} ${parts[i]}`;
    if (displayWidth(combined) <= maxWidth) {
      current = combined;
    } else {
      groups.push(current);
      current = parts[i];
    }
  }
  groups.push(current);

  return groups;
}

/**
 * Split text into `n` roughly equal parts by character count.
 * Prefers splitting after Korean grammatical endings > spaces > raw position.
 */
function splitIntoNParts(text: string, n: number): string[] {
  if (n <= 1 || text.length === 0) return [text];

  const targetLen = Math.ceil(text.length / n);
  const parts: string[] = [];
  let remaining = text;

  for (let i = 0; i < n - 1 && remaining.length > 0; i++) {
    const splitIdx = findBestSplitPoint(remaining, targetLen);
    parts.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining.length > 0) parts.push(remaining);

  return parts.filter((p) => p.length > 0);
}

/**
 * Find the best position to split `text` near `targetIdx`.
 * Scores candidate spaces: Korean sentence ending > clause ending > plain space.
 */
function findBestSplitPoint(text: string, targetIdx: number): number {
  const lo = Math.floor(targetIdx * 0.7);
  const hi = Math.min(Math.ceil(targetIdx * 1.3), text.length - 1);

  let bestIdx = -1;
  let bestScore = -1;

  for (let j = lo; j <= hi; j++) {
    if (text[j] !== " " && text[j] !== "\u3000") continue;

    // Check what word precedes this space
    const wordBefore = text.slice(Math.max(0, j - 10), j).split(/\s+/).pop() ?? "";
    let score = 1; // base: any space
    if (KO_SENTENCE_END.test(wordBefore)) score = 3;
    else if (KO_CLAUSE_END.test(wordBefore)) score = 2;

    // Tie-break: prefer position closer to target
    const dist = Math.abs(j - targetIdx) / (targetIdx || 1);
    const finalScore = score - dist * 0.3;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestIdx = j;
    }
  }

  // Fallback: no space found in range, use target directly
  return bestIdx > 0 ? bestIdx : Math.min(targetIdx, text.length);
}


// ── Width rebalancing ─────────────────────────────────────────────────────────

/**
 * Partition `words` into `numGroups` groups with roughly equal display widths.
 * Uses a greedy algorithm with a dynamic per-group target:
 *   target = remainingWidth / remainingGroups
 * Flushes the current group when adding the next word overshoots more
 * than skipping it undershoots (whichever is closer to target).
 * Tiebreaker: prefer flushing after Korean sentence/clause endings.
 */
function partitionWordsEvenly(
  words: string[],
  numGroups: number,
  maxWidth: number,
): string[] {
  if (words.length === 0) return [];
  if (numGroups <= 1) return [words.join(" ")];
  if (words.length <= numGroups) return words.map((w) => w); // 1 word per group

  const wordWidths = words.map((w) => displayWidth(w));
  const totalWidth = wordWidths.reduce((a, b) => a + b, 0);

  const groups: string[] = [];
  let currentWords: string[] = [];
  let currentWidth = 0;
  let remainingWidth = totalWidth;
  let remainingGroups = numGroups;

  for (let i = 0; i < words.length; i++) {
    const wWidth = wordWidths[i];
    const target = remainingWidth / remainingGroups;
    const widthAfterAdd = currentWidth + wWidth;

    // Always add at least one word to current group
    if (currentWords.length === 0) {
      currentWords.push(words[i]);
      currentWidth = widthAfterAdd;
      continue;
    }

    // Check if we should flush before adding this word
    const undershoot = Math.abs(currentWidth - target);   // width if we flush now
    const overshoot = Math.abs(widthAfterAdd - target);   // width if we add then flush

    // Korean grammar tiebreaker: slightly prefer flushing after grammatical endings
    const lastWord = currentWords[currentWords.length - 1];
    const grammarBonus =
      KO_SENTENCE_END.test(lastWord) ? 0.15 :
      KO_CLAUSE_END.test(lastWord) ? 0.10 : 0;

    const shouldFlush =
      remainingGroups > 1 &&
      currentWords.length > 0 &&
      (undershoot + grammarBonus) < overshoot &&
      // Don't flush if it would leave too many words for remaining groups
      (words.length - i) >= remainingGroups;

    if (shouldFlush && groupWidthOk(currentWords, maxWidth)) {
      groups.push(currentWords.join(" "));
      remainingWidth -= currentWidth;
      remainingGroups--;
      currentWords = [words[i]];
      currentWidth = wWidth;
    } else {
      // Don't exceed maxWidth — force flush if adding would overflow
      if (widthAfterAdd > maxWidth && currentWords.length > 0 && remainingGroups > 1) {
        groups.push(currentWords.join(" "));
        remainingWidth -= currentWidth;
        remainingGroups--;
        currentWords = [words[i]];
        currentWidth = wWidth;
      } else {
        currentWords.push(words[i]);
        currentWidth = widthAfterAdd;
      }
    }
  }

  // Flush remaining
  if (currentWords.length > 0) {
    groups.push(currentWords.join(" "));
  }

  return groups;
}

/** Check that words joined fit within maxWidth. */
function groupWidthOk(words: string[], maxWidth: number): boolean {
  return displayWidth(words.join(" ")) <= maxWidth;
}

/**
 * Rebalance text parts so display widths are roughly equal.
 *
 * If the max/min width ratio exceeds 1.5, decomposes all parts into
 * atomic words and re-partitions them evenly using `partitionWordsEvenly`.
 * Returns the original parts if they're already balanced.
 */
function rebalanceWidths(parts: string[], maxWidth: number): string[] {
  if (parts.length <= 1) return parts;

  const widths = parts.map((p) => displayWidth(p));
  const minW = Math.min(...widths);
  const maxW = Math.max(...widths);

  // Already balanced enough
  if (minW > 0 && maxW / minW <= 1.5) return parts;

  // Decompose into atomic words
  const allWords: string[] = [];
  for (const part of parts) {
    const words = part.split(/\s+/).filter((w) => w.length > 0);
    allWords.push(...words);
  }

  if (allWords.length <= parts.length) return parts; // can't rebalance further

  const rebalanced = partitionWordsEvenly(allWords, parts.length, maxWidth);

  // Verify rebalanced is actually better
  const newWidths = rebalanced.map((p) => displayWidth(p));
  const newMin = Math.min(...newWidths);
  const newMax = Math.max(...newWidths);
  const oldRatio = minW > 0 ? maxW / minW : Infinity;
  const newRatio = newMin > 0 ? newMax / newMin : Infinity;

  return newRatio < oldRatio ? rebalanced : parts;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface TranscriptionSegment {
  start_time: number;
  end_time: number;
  text: string;
  [key: string]: unknown;
}

interface SplitOptions {
  /** Max subtitle lines per segment (default: 3) */
  maxLines?: number;
  /** Max duration in seconds per segment (default: 2) */
  maxDuration?: number;
}

/**
 * Split segments that are too long (text or duration).
 *
 * A segment is split if:
 *   - Its text would exceed `maxLines` subtitle lines, OR
 *   - Its duration exceeds `maxDuration` seconds
 *
 * Original segment fields (id, etc.) are preserved in all output segments.
 */
export function splitLongSegments(
  segments: TranscriptionSegment[],
  options: SplitOptions | number = {},
): TranscriptionSegment[] {
  // Back-compat: accept bare number as maxLines
  const opts: SplitOptions =
    typeof options === "number" ? { maxLines: options } : options;
  const maxLines = opts.maxLines ?? 3;
  const maxDuration = opts.maxDuration ?? 2;
  const maxWidth = maxLines * MAX_LINE_WIDTH;

  const result: TranscriptionSegment[] = [];

  for (const seg of segments) {
    const width = displayWidth(seg.text);
    const duration = seg.end_time - seg.start_time;

    // Pass through if both constraints satisfied
    if (width <= maxWidth && duration <= maxDuration) {
      result.push(seg);
      continue;
    }

    // Determine how many chunks we need
    const chunksByWidth = width > maxWidth ? Math.ceil(width / maxWidth) : 1;
    const chunksByDuration =
      duration > maxDuration ? Math.ceil(duration / maxDuration) : 1;
    const targetChunks = Math.max(chunksByWidth, chunksByDuration);

    // Split text into targetChunks parts using best available boundaries
    const rawParts = splitTextSmart(seg.text, targetChunks, maxWidth);
    // Rebalance so all parts have roughly equal display widths
    const textParts = rebalanceWidths(rawParts, maxWidth);

    // Guard: if splitting produced nothing, keep original
    if (textParts.length === 0) {
      result.push(seg);
      continue;
    }

    // Distribute timing proportionally by display width
    const totalWidth = textParts.reduce((sum, t) => sum + displayWidth(t), 0);
    let currentTime = seg.start_time;

    for (let i = 0; i < textParts.length; i++) {
      const gWidth = displayWidth(textParts[i]);
      const gDuration =
        totalWidth > 0
          ? (gWidth / totalWidth) * duration
          : duration / textParts.length;

      const isLast = i === textParts.length - 1;
      const endTime = isLast ? seg.end_time : currentTime + gDuration;

      result.push({
        ...seg, // Preserve id, seek, tokens, etc.
        start_time: Math.round(currentTime * 1000) / 1000,
        end_time: Math.round(endTime * 1000) / 1000,
        text: textParts[i],
      });

      currentTime = endTime;
    }
  }

  // Recursive re-split: if any output segment still violates constraints,
  // run again. Guard against infinite loop by requiring progress.
  const hasViolation = result.some((seg) => {
    const w = displayWidth(seg.text);
    const d = seg.end_time - seg.start_time;
    return w > maxWidth || d > maxDuration;
  });
  if (hasViolation && result.length > segments.length) {
    return splitLongSegments(result, opts);
  }

  return result;
}

// ── Smart text splitter ───────────────────────────────────────────────────────

/**
 * Split text into approximately `targetChunks` pieces, each ≤ `maxWidth`.
 *
 * Tries boundaries in order:
 *   1. Sentence punctuation  (.!?。！？…)
 *   2. Clause punctuation    (,;:，；：、)
 *   3. Korean grammar        (~다, ~요, ~고, ~면, ~서…)
 *   4. Space boundaries
 *   5. Character count (last resort, prefers Korean endings)
 */
function splitTextSmart(
  text: string,
  targetChunks: number,
  maxWidth: number,
): string[] {
  // 1. Try sentence punctuation split → group
  const sentences = splitAtSentences(text);
  if (sentences.length >= targetChunks) {
    const groups = groupByWidth(sentences, maxWidth);
    if (groups.length >= targetChunks) return groups;
  }

  // 2. Try clause punctuation split → group
  const allClauses: string[] = [];
  for (const sent of sentences) {
    const clauses = splitAtClauses(sent);
    allClauses.push(...clauses);
  }
  if (allClauses.length >= targetChunks) {
    const groups = groupByWidth(allClauses, maxWidth);
    if (groups.length >= targetChunks) return groups;
  }

  // 3. Try Korean grammatical boundaries → group
  const koPhrases = splitAtKoreanGrammar(text);
  if (koPhrases.length >= targetChunks) {
    const groups = groupByWidth(koPhrases, maxWidth);
    if (groups.length >= targetChunks) return groups;
  }
  // Even if fewer than targetChunks, Korean phrases are better than raw spaces
  if (koPhrases.length > 1) {
    // Sub-split the longest Korean phrase to reach targetChunks
    const groups = groupByWidth(koPhrases, maxWidth);
    if (groups.length > 1) return groups;
  }

  // 4. Try space split → group
  const words = splitAtSpaces(text);
  if (words.length >= targetChunks) {
    const groups = groupByWidth(words, maxWidth);
    if (groups.length >= targetChunks) return groups;
  }

  // 5. Last resort: split by character count (Korean-ending aware)
  return splitIntoNParts(text, targetChunks);
}


// ── Word-level subtitle creation (Post-TTS Whisper realignment) ────────────

export interface WordTimestampInput {
  word: string;
  start: number; // seconds relative to TTS audio start
  end: number;
}

interface CreateSubtitlesOptions {
  maxLines?: number;
  maxDuration?: number;
}

/**
 * Create subtitle segments from word-level timestamps obtained via
 * Whisper re-transcription of TTS audio.
 *
 * Unlike `splitLongSegments` which approximates timing by display-width
 * proportion, this uses ACTUAL word timing from the TTS audio, producing
 * subtitles that are precisely synchronized with the spoken audio.
 *
 * @param words          - Word-level timestamps from Whisper realignment.
 * @param segmentOffset  - Start time of the parent segment in the video timeline.
 * @param segmentEndTime - End time of the parent segment in the video timeline.
 * @param segmentId      - ID of the parent segment (preserved in output).
 * @param originalText   - Source language text (for reference display).
 * @param options        - maxLines (default 2) and maxDuration (default 2s).
 */
export function createSubtitlesFromWords(
  words: WordTimestampInput[],
  segmentOffset: number,
  segmentEndTime: number,
  segmentId: string,
  originalText: string,
  options: CreateSubtitlesOptions = {},
): { id: string; startTime: number; endTime: number; originalText: string; translatedText: string }[] {
  const maxLines = options.maxLines ?? 2;
  const maxDuration = options.maxDuration ?? 2;
  const maxWidth = maxLines * MAX_LINE_WIDTH;
  const MIN_WORDS = 3;
  const MAX_WORDS = 8;

  if (words.length === 0) return [];

  // Scale word timestamps to fit within the segment's time window.
  // Whisper timestamps are relative to TTS audio duration, which may differ
  // from the segment slot. The audio is tempo-adjusted to fit, so we scale
  // the timestamps by the same ratio: segmentDuration / ttsDuration.
  const segmentDuration = segmentEndTime - segmentOffset;
  const maxWordEnd = words[words.length - 1].end;
  const timeScale = maxWordEnd > 0 && segmentDuration > 0
    ? segmentDuration / maxWordEnd
    : 1;
  const scaledWords: WordTimestampInput[] = words.map(w => ({
    word: w.word,
    start: w.start * timeScale,
    end: w.end * timeScale,
  }));

  const result: { id: string; startTime: number; endTime: number; originalText: string; translatedText: string }[] = [];

  let groupWords: WordTimestampInput[] = [];
  let groupText = "";
  let groupStart = scaledWords[0].start;

  for (const word of scaledWords) {
    // Build candidate text: add space between words (Whisper returns
    // space-separated units for Korean/English; for CJK without spaces,
    // Whisper still returns discrete tokens that read correctly with spaces).
    const testText = groupText ? `${groupText} ${word.word}` : word.word;
    const testWidth = displayWidth(testText);
    const testDuration = word.end - groupStart;

    // Check if adding this word would violate constraints
    const wouldOverflow =
      groupWords.length > 0 && (testWidth > maxWidth || testDuration > maxDuration || groupWords.length >= MAX_WORDS);

    if (wouldOverflow && groupWords.length >= MIN_WORDS) {
      // Flush current group as a subtitle segment
      result.push({
        id: segmentId,
        startTime: Math.round((segmentOffset + groupStart) * 1000) / 1000,
        endTime: Math.round((segmentOffset + groupWords[groupWords.length - 1].end) * 1000) / 1000,
        originalText,
        translatedText: groupText,
      });

      // Start new group with this word
      groupWords = [word];
      groupText = word.word;
      groupStart = word.start;
    } else {
      groupWords.push(word);
      groupText = testText;
    }

  }
  // Flush remaining words — merge into previous group if too short
  if (groupWords.length > 0) {
    if (groupWords.length < MIN_WORDS && result.length > 0) {
      // Merge remainder into previous subtitle to avoid 1-2 word orphans
      const prev = result[result.length - 1];
      prev.endTime = Math.round((segmentOffset + groupWords[groupWords.length - 1].end) * 1000) / 1000;
      prev.translatedText += " " + groupText;
    } else {
      result.push({
        id: segmentId,
        startTime: Math.round((segmentOffset + groupStart) * 1000) / 1000,
        endTime: Math.round((segmentOffset + groupWords[groupWords.length - 1].end) * 1000) / 1000,
        originalText,
        translatedText: groupText,
      });
    }
  }

  return result;
}
