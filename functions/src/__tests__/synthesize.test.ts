/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mocks ───────────────────────────────────────────────────────────────

const mockSynthesizeSpeech = jest.fn();

jest.mock("firebase-functions/v2/https", () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "HttpsError";
    }
  }
  return {
    onCall: jest.fn((_opts: any, handler: any) => handler),
    HttpsError,
  };
});

jest.mock("@google-cloud/text-to-speech", () => ({
  TextToSpeechClient: jest.fn().mockImplementation(() => ({
    synthesizeSpeech: mockSynthesizeSpeech,
  })),
}));

// ── Imports ─────────────────────────────────────────────────────────────

import {synthesize} from "../pipeline/synthesize";

const handler = synthesize as unknown as (req: any) => Promise<any>;

// ── Helpers ─────────────────────────────────────────────────────────────

const fakeAudio = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

function validReq(overrides: Record<string, any> = {}) {
  return {
    auth: {uid: "u1"},
    data: {
      text: "안녕하세요",
      voice_id: "ko-KR-Standard-A",
      language: "ko",
      speed: 1.0,
      ...overrides,
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("synthesize", () => {
  beforeEach(() => jest.clearAllMocks());

  // ─ Auth ────────────────────────────────────────────────────────────

  it("rejects unauthenticated requests", async () => {
    await expect(
      handler({data: {text: "hi", voice_id: "v", language: "en"}})
    ).rejects.toMatchObject({code: "unauthenticated"});
  });

  // ─ Text validation ────────────────────────────────────────────────

  it("rejects empty text", async () => {
    await expect(handler(validReq({text: ""}))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("rejects whitespace-only text", async () => {
    await expect(handler(validReq({text: "   "}))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("rejects text exceeding 5000 chars", async () => {
    await expect(
      handler(validReq({text: "a".repeat(5001)}))
    ).rejects.toMatchObject({code: "invalid-argument"});
  });

  // ─ Language validation ────────────────────────────────────────────

  it("rejects unsupported language code", async () => {
    await expect(
      handler(validReq({language: "xx"}))
    ).rejects.toMatchObject({code: "invalid-argument"});
  });

  // ─ Successful synthesis ───────────────────────────────────────────

  it("returns base64-encoded audio on success", async () => {
    mockSynthesizeSpeech.mockResolvedValueOnce([{audioContent: fakeAudio}]);

    const result = await handler(validReq());

    expect(result.audioBase64).toBe(
      Buffer.from(fakeAudio).toString("base64")
    );
  });

  it("calls TTS with correct voice and language mapping", async () => {
    mockSynthesizeSpeech.mockResolvedValueOnce([{audioContent: fakeAudio}]);

    await handler(validReq());

    expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: {languageCode: "ko-KR", name: "ko-KR-Standard-A"},
        audioConfig: {audioEncoding: "MP3"},
      })
    );
  });

  // ─ SSML generation ────────────────────────────────────────────────

  it("wraps text in <speak><prosody> SSML", async () => {
    mockSynthesizeSpeech.mockResolvedValueOnce([{audioContent: fakeAudio}]);

    await handler(validReq());

    const ssml = mockSynthesizeSpeech.mock.calls[0][0].input.ssml;
    expect(ssml).toMatch(/^<speak><prosody rate="\d+%">.*<\/prosody><\/speak>$/);
    expect(ssml).toContain("안녕하세요");
  });

  it("applies speed as prosody rate percentage", async () => {
    mockSynthesizeSpeech.mockResolvedValueOnce([{audioContent: fakeAudio}]);

    await handler(validReq({speed: 1.5}));

    const ssml = mockSynthesizeSpeech.mock.calls[0][0].input.ssml;
    expect(ssml).toContain('rate="150%"');
  });

  it("clamps speed to 0.25–4.0 range", async () => {
    // Too low → 25%
    mockSynthesizeSpeech.mockResolvedValueOnce([{audioContent: fakeAudio}]);
    await handler(validReq({speed: 0.1}));
    expect(mockSynthesizeSpeech.mock.calls[0][0].input.ssml).toContain(
      'rate="25%"'
    );

    // Too high → 400%
    mockSynthesizeSpeech.mockResolvedValueOnce([{audioContent: fakeAudio}]);
    await handler(validReq({speed: 10}));
    expect(mockSynthesizeSpeech.mock.calls[1][0].input.ssml).toContain(
      'rate="400%"'
    );
  });

  it("defaults speed to 1.0 (100%) when not specified", async () => {
    mockSynthesizeSpeech.mockResolvedValueOnce([{audioContent: fakeAudio}]);

    await handler({
      auth: {uid: "u1"},
      data: {text: "hi", voice_id: "en-US-Standard-A", language: "en"},
    });

    const ssml = mockSynthesizeSpeech.mock.calls[0][0].input.ssml;
    expect(ssml).toContain('rate="100%"');
  });

  // ─ XML escaping ───────────────────────────────────────────────────

  it("escapes special XML characters in SSML", async () => {
    mockSynthesizeSpeech.mockResolvedValueOnce([{audioContent: fakeAudio}]);

    await handler(validReq({text: "A & B < C > D \"E\" 'F'"}));

    const ssml: string = mockSynthesizeSpeech.mock.calls[0][0].input.ssml;
    expect(ssml).toContain("&amp;");
    expect(ssml).toContain("&lt;");
    expect(ssml).toContain("&gt;");
    expect(ssml).toContain("&quot;");
    expect(ssml).toContain("&apos;");
  });

  // ─ Language code mapping ──────────────────────────────────────────

  it("maps all supported short codes to BCP-47", async () => {
    const langMap: Record<string, string> = {
      ko: "ko-KR",
      en: "en-US",
      ja: "ja-JP",
      zh: "cmn-CN",
      es: "es-ES",
    };

    for (const [short, bcp] of Object.entries(langMap)) {
      mockSynthesizeSpeech.mockResolvedValueOnce([{audioContent: fakeAudio}]);
      await handler(validReq({language: short, voice_id: `${bcp}-Standard-A`}));
      const lastCall =
        mockSynthesizeSpeech.mock.calls[
          mockSynthesizeSpeech.mock.calls.length - 1
        ][0];
      expect(lastCall.voice.languageCode).toBe(bcp);
    }
  });

  // ─ Error wrapping ─────────────────────────────────────────────────

  it("wraps TTS API errors as internal HttpsError", async () => {
    mockSynthesizeSpeech.mockRejectedValueOnce(new Error("TTS quota exceeded"));

    await expect(handler(validReq())).rejects.toMatchObject({
      code: "internal",
    });
  });
});
