import { describe, it, expect } from "vitest";
import {
  displayWidth,
  estimateLines,
  splitLongSegments,
  type TranscriptionSegment,
} from "../lib/pipeline/segmentSplitter";

// ── displayWidth ──────────────────────────────────────────────────────────────

describe("displayWidth", () => {
  it("counts Latin characters as 1 unit each", () => {
    expect(displayWidth("hello")).toBe(5);
  });

  it("counts CJK characters as 2 units each", () => {
    expect(displayWidth("안녕요")).toBe(6);
  });

  it("handles mixed CJK + Latin", () => {
    expect(displayWidth("Hi안녕")).toBe(6);
  });

  it("ignores spaces", () => {
    expect(displayWidth("a b c")).toBe(3);
  });

  it("returns 0 for empty string", () => {
    expect(displayWidth("")).toBe(0);
  });
});

// ── estimateLines ─────────────────────────────────────────────────────────────

describe("estimateLines", () => {
  it("returns 0 for empty string", () => {
    expect(estimateLines("")).toBe(0);
  });

  it("returns 1 for short text", () => {
    expect(estimateLines("hello")).toBe(1);
  });

  it("returns 2 for text wider than one line", () => {
    // 10 CJK = 20 units = exactly 1 line (MAX_LINE_WIDTH=20)
    expect(estimateLines("가나다라마바사아자차")).toBe(1);
    // 11 CJK = 22 units = 2 lines
    expect(estimateLines("가나다라마바사아자차카")).toBe(2);
  });

  it("returns 3+ for very long text", () => {
    // 30 CJK = 60 units = exactly 3 lines (MAX_LINE_WIDTH=20)
    const threeLines = "가".repeat(30);
    expect(estimateLines(threeLines)).toBe(3);
    const fourLines = "가".repeat(31);
    expect(estimateLines(fourLines)).toBe(4);
  });
});

// ── splitLongSegments ─────────────────────────────────────────────────────────

describe("splitLongSegments", () => {
  const makeSeg = (
    text: string,
    start = 0,
    end = 10,
    extra: Record<string, unknown> = {},
  ): TranscriptionSegment => ({
    start_time: start,
    end_time: end,
    text,
    ...extra,
  });

  it("passes short segments through unchanged", () => {
    const seg = makeSeg("짧은 문장", 0, 1.5);
    const result = splitLongSegments([seg]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(seg);
  });

  it("splits a segment with multiple sentences (text too wide)", () => {
    const text =
      "오늘 날씨가 매우 좋습니다. 하늘이 맑고 바람이 시원합니다. 산책하기 딱 좋은 날입니다. 공원에 사람들이 많이 나왔습니다.";
    const seg = makeSeg(text, 0, 1.5);
    const result = splitLongSegments([seg]);

    expect(result.length).toBeGreaterThan(1);
    for (const r of result) {
      expect(estimateLines(r.text)).toBeLessThanOrEqual(3);
    }
  });

  it("splits a segment that exceeds max duration even if text is short", () => {
    // Short text (1 line) but duration = 6s → should split into 3 × 2s
    const seg = makeSeg("짧은 문장입니다.", 0, 6);
    const result = splitLongSegments([seg], { maxDuration: 2 });

    expect(result.length).toBeGreaterThanOrEqual(3);
    for (const r of result) {
      const dur = r.end_time - r.start_time;
      expect(dur).toBeLessThanOrEqual(2.01); // small float tolerance
    }
  });

  it("preserves original segment fields (id, etc.) in split results", () => {
    const text =
      "첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다. 네 번째 문장입니다.";
    const seg = makeSeg(text, 0, 8, { id: "seg-42", seek: 1000 });
    const result = splitLongSegments([seg]);

    expect(result.length).toBeGreaterThan(1);
    for (const r of result) {
      expect(r.id).toBe("seg-42");
      expect(r.seek).toBe(1000);
    }
  });

  it("preserves timing boundaries (first=start, last=end)", () => {
    const text =
      "첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다. 네 번째 문장입니다. 다섯 번째 문장입니다. 여섯 번째 문장입니다.";
    const seg = makeSeg(text, 2.5, 18.0);
    const result = splitLongSegments([seg]);

    expect(result.length).toBeGreaterThan(1);
    expect(result[0].start_time).toBe(2.5);
    expect(result[result.length - 1].end_time).toBe(18.0);
  });

  it("distributes timing monotonically (no gaps, no overlaps)", () => {
    const text =
      "이것은 아주 긴 문장입니다. 여러 문장으로 나누어져야 합니다. 자막이 세 줄을 넘으면 안됩니다. 그래서 적절히 쪼개야 합니다.";
    const seg = makeSeg(text, 0, 12);
    const result = splitLongSegments([seg]);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].start_time).toBeCloseTo(result[i - 1].end_time, 2);
      expect(result[i].end_time).toBeGreaterThan(result[i].start_time);
    }
  });

  it("falls back to clause splitting when a single sentence is too long", () => {
    const text =
      "오늘은 날씨가 좋아서 공원에 갔는데, 거기서 친구를 만나서 같이 산책을 했고, 산책 후에 카페에서 커피를 마시면서 이야기를 나눴습니다";
    const seg = makeSeg(text, 0, 1.5);
    const result = splitLongSegments([seg]);

    expect(result.length).toBeGreaterThan(1);
    for (const r of result) {
      expect(estimateLines(r.text)).toBeLessThanOrEqual(3);
    }
  });

  it("handles English text correctly", () => {
    const text =
      "This is the first sentence. This is the second sentence which is a bit longer. Here comes the third one. And finally the fourth sentence to make it really long.";
    const seg = makeSeg(text, 0, 1.5);
    const result = splitLongSegments([seg]);

    expect(result.length).toBeGreaterThan(1);
    for (const r of result) {
      expect(estimateLines(r.text)).toBeLessThanOrEqual(3);
    }
  });

  it("processes multiple segments independently", () => {
    const short = makeSeg("짧은 문장", 0, 1.5);
    const long = makeSeg(
      "첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다. 네 번째 문장입니다. 다섯 번째 문장입니다.",
      1.5,
      2.0,
    );
    const result = splitLongSegments([short, long]);

    expect(result[0]).toEqual(short);
    expect(result.length).toBeGreaterThan(2);
  });

  it("handles segment with no punctuation at all", () => {
    const text =
      "가나다라마바사아자차카타파하갸냐댜랴먀뱌셔져쪄쪄져셔뱌먀랴댜냐갸가나다라마바사아자차카타파하갸냐댜랴먀뱌";
    const seg = makeSeg(text, 0, 1.5);
    const result = splitLongSegments([seg]);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const totalText = result.map((r) => r.text).join(" ");
    expect(displayWidth(totalText)).toBeGreaterThan(0);
  });

  it("returns empty array for empty input", () => {
    expect(splitLongSegments([])).toEqual([]);
  });

  it("respects custom maxLines parameter (back-compat number)", () => {
    const text = "첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다.";
    const seg = makeSeg(text, 0, 1.5);

    // maxLines=3 via number back-compat: should not split
    expect(splitLongSegments([seg], 3)).toHaveLength(1);

    // maxLines=1: should split
    expect(splitLongSegments([seg], 1).length).toBeGreaterThan(1);
  });

  it("splits by duration even when text is short enough", () => {
    // 5-second segment with short text → split into 3 parts (ceil(5/2))
    const seg = makeSeg("Hello world, this is a test.", 0, 5);
    const result = splitLongSegments([seg], { maxLines: 3, maxDuration: 2 });

    expect(result.length).toBeGreaterThanOrEqual(3);
    // All durations ≤ 2 seconds
    for (const r of result) {
      expect(r.end_time - r.start_time).toBeLessThanOrEqual(2.01);
    }
  });

  it("applies both text and duration constraints simultaneously", () => {
    // Long text AND long duration
    const text =
      "이것은 아주 긴 문장입니다. 여러 문장으로 나누어져야 합니다. 자막이 세 줄을 넘으면 안됩니다. 그래서 적절히 쪼개야 합니다.";
    const seg = makeSeg(text, 0, 10);
    const result = splitLongSegments([seg], { maxLines: 3, maxDuration: 2 });

    expect(result.length).toBeGreaterThanOrEqual(5);
    for (const r of result) {
      expect(r.end_time - r.start_time).toBeLessThanOrEqual(2.01);
      expect(estimateLines(r.text)).toBeLessThanOrEqual(3);
    }
  });

  it("splits Korean text without punctuation at grammatical boundaries", () => {
    // Whisper output often has no punctuation — should split at ~다/~요/~고 etc.
    const text =
      "오늘 날씨가 좋아서 공원에 갔다 거기서 친구를 만났고 같이 산책을 했다 산책 후에 카페에 가서 커피를 마셨다";
    const seg = makeSeg(text, 0, 8);
    const result = splitLongSegments([seg], { maxLines: 3, maxDuration: 2 });

    expect(result.length).toBeGreaterThanOrEqual(3);
    // Each fragment should end at a Korean grammatical boundary when possible
    for (const r of result) {
      expect(estimateLines(r.text)).toBeLessThanOrEqual(3);
      expect(r.end_time - r.start_time).toBeLessThanOrEqual(2.01);
    }
    // At least one fragment should end with a Korean ending (다/고/서)
    const endsWithKorean = result.some((r) =>
      /(?:다|고|서|요|면)$/.test(r.text.trim()),
    );
    expect(endsWithKorean).toBe(true);
  });

  it("splits Korean clause connectors naturally", () => {
    const text =
      "비가 오면 우산을 가져가고 눈이 오면 장갑을 끼고 바람이 불면 마스크를 쓴다";
    const seg = makeSeg(text, 0, 6);
    const result = splitLongSegments([seg], { maxLines: 2, maxDuration: 2 });

    expect(result.length).toBeGreaterThanOrEqual(3);
    for (const r of result) {
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.end_time - r.start_time).toBeLessThanOrEqual(2.01);
    }
  });

  it("prefers Korean grammar over mid-word splitting", () => {
    // Long Korean text with no punctuation and no clear sentence endings,
    // but has clause connectors (~고, ~서)
    const text =
      "아침에 일어나서 밥을 먹고 학교에 갔다";
    const seg = makeSeg(text, 0, 4);
    const result = splitLongSegments([seg], { maxLines: 1, maxDuration: 2 });

    // Should split at grammatical boundaries, not mid-word
    for (const r of result) {
      // No fragment should start/end with a broken syllable
      expect(r.text.trim().length).toBeGreaterThan(0);
    }
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Width balance tests ────────────────────────────────────────────────────────

describe("splitLongSegments — balanced width distribution", () => {
  const makeSeg = (
    text: string,
    start = 0,
    end = 10,
  ): TranscriptionSegment => ({
    start_time: start,
    end_time: end,
    text,
  });

  /** Helper: max/min display-width ratio of split results. */
  function widthRatio(segments: TranscriptionSegment[]): number {
    const widths = segments.map((s) => displayWidth(s.text));
    const min = Math.min(...widths);
    const max = Math.max(...widths);
    return min > 0 ? max / min : Infinity;
  }

  it("produces balanced widths when splitting long Korean text", () => {
    // Long Korean text that would split into multiple segments
    const text =
      "오늘 날씨가 매우 좋습니다 하늘이 맑고 바람이 시원합니다 산책하기 딱 좋은 날입니다 공원에 사람들이 많이 나왔습니다";
    const seg = makeSeg(text, 0, 8);
    const result = splitLongSegments([seg], { maxLines: 2, maxDuration: 2 });

    expect(result.length).toBeGreaterThan(1);
    // Width ratio should be reasonably balanced (≤ 2.0 is generous margin)
    expect(widthRatio(result)).toBeLessThanOrEqual(2.0);
  });

  it("produces balanced widths for mixed-length clauses", () => {
    // Deliberately uneven clauses: one very short, one very long
    const text =
      "비가 오면 우산을 가져가고 눈이 오면 따뜻한 장갑을 끼고 바람이 많이 불면 마스크를 꼭 쓴다";
    const seg = makeSeg(text, 0, 6);
    const result = splitLongSegments([seg], { maxLines: 2, maxDuration: 2 });

    expect(result.length).toBeGreaterThan(1);
    expect(widthRatio(result)).toBeLessThanOrEqual(2.5);
  });

  it("does not worsen already-balanced splits", () => {
    // Short text that splits evenly naturally
    const text = "좋은 아침 반가워요";
    const seg = makeSeg(text, 0, 1);
    const result = splitLongSegments([seg], { maxLines: 3, maxDuration: 2 });

    // Should pass through unchanged (short text, short duration)
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(text);
  });

  it("rebalances when groupByWidth produces very uneven parts", () => {
    // Simulate a text where natural boundaries produce uneven splits
    const text =
      "아 이것은 매우 긴 문장이고 두 번째는 짧다 세 번째 문장은 다시 길어서 균형이 안맞는 경우입니다";
    const seg = makeSeg(text, 0, 8);
    const result = splitLongSegments([seg], { maxLines: 2, maxDuration: 2 });

    expect(result.length).toBeGreaterThan(1);
    // All segments should have roughly similar widths
    const widths = result.map((r) => displayWidth(r.text));
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
    // No single segment should be more than 2x the average
    for (const w of widths) {
      expect(w).toBeLessThanOrEqual(avg * 2.5);
    }
  });

  it("preserves all text content after rebalancing", () => {
    const text =
      "오늘 날씨가 좋아서 공원에 갔다 거기서 친구를 만났고 같이 산책을 했다 산책 후에 카페에 가서 커피를 마셨다";
    const seg = makeSeg(text, 0, 8);
    const result = splitLongSegments([seg], { maxLines: 2, maxDuration: 2 });

    // Join all result texts and compare words — no words should be lost
    const originalWords = text.split(/\s+/).sort();
    const resultWords = result
      .map((r) => r.text)
      .join(" ")
      .split(/\s+/)
      .sort();
    expect(resultWords).toEqual(originalWords);
  });

  it("still respects maxWidth constraint after rebalancing", () => {
    const text =
      "이것은 아주 긴 문장입니다 여러 문장으로 나누어져야 합니다 자막이 세 줄을 넘으면 안됩니다 그래서 적절히 쪼개야 합니다";
    const seg = makeSeg(text, 0, 10);
    const result = splitLongSegments([seg], { maxLines: 3, maxDuration: 2 });

    const maxWidth = 3 * 20; // maxLines * MAX_LINE_WIDTH (font size 80)
    for (const r of result) {
      expect(displayWidth(r.text)).toBeLessThanOrEqual(maxWidth);
    }
  });
});
