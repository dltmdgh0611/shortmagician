"use strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
// ── Mocks (hoisted before imports) ──────────────────────────────────────
const mockTranscriptionCreate = jest.fn();
const mockToFile = jest.fn().mockResolvedValue({});
const mockAdd = jest.fn().mockResolvedValue({});
jest.mock("firebase-functions/v2/https", () => {
    class HttpsError extends Error {
        code;
        constructor(code, message) {
            super(message);
            this.code = code;
            this.name = "HttpsError";
        }
    }
    return {
        onCall: jest.fn((_opts, handler) => handler),
        HttpsError,
    };
});
jest.mock("firebase-functions/params", () => ({
    defineSecret: jest.fn(() => ({ value: () => "mock-openai-key" })),
}));
jest.mock("openai", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        audio: { transcriptions: { create: mockTranscriptionCreate } },
    })),
    toFile: mockToFile,
}));
jest.mock("firebase-admin", () => {
    const mockFirestore = jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({ add: mockAdd }),
    });
    mockFirestore.FieldValue = { serverTimestamp: jest.fn() };
    return {
        apps: [{}],
        initializeApp: jest.fn(),
        firestore: mockFirestore,
    };
});
// ── Imports (after mocks) ───────────────────────────────────────────────
const transcribe_1 = require("../pipeline/transcribe");
const handler = transcribe_1.transcribe;
// ── Tests ───────────────────────────────────────────────────────────────
describe("transcribe", () => {
    beforeEach(() => jest.clearAllMocks());
    const validBase64 = Buffer.from("fake-audio-data").toString("base64");
    // ─ Auth ────────────────────────────────────────────────────────────
    it("rejects unauthenticated requests", async () => {
        await expect(handler({ data: { audioBase64: validBase64, filename: "test.mp3" } })).rejects.toMatchObject({ code: "unauthenticated" });
    });
    // ─ File size ───────────────────────────────────────────────────────
    it("rejects files larger than 25 MB", async () => {
        const bigBase64 = Buffer.alloc(25 * 1024 * 1024 + 1).toString("base64");
        await expect(handler({
            auth: { uid: "u1" },
            data: { audioBase64: bigBase64, filename: "big.mp3" },
        })).rejects.toMatchObject({ code: "invalid-argument" });
    });
    // ─ No-speech ──────────────────────────────────────────────────────
    it("throws when Whisper returns empty segments", async () => {
        mockTranscriptionCreate.mockResolvedValueOnce({
            segments: [],
            language: "korean",
        });
        await expect(handler({
            auth: { uid: "u1" },
            data: { audioBase64: validBase64, filename: "empty.mp3" },
        })).rejects.toMatchObject({ code: "failed-precondition" });
    });
    it("throws when ALL segments are no-speech (prob > 0.6)", async () => {
        mockTranscriptionCreate.mockResolvedValueOnce({
            segments: [
                { id: 0, start: 0, end: 2, text: "...", no_speech_prob: 0.9 },
                { id: 1, start: 2, end: 4, text: "...", no_speech_prob: 0.8 },
            ],
            language: "korean",
        });
        await expect(handler({
            auth: { uid: "u1" },
            data: { audioBase64: validBase64, filename: "noise.mp3" },
        })).rejects.toMatchObject({ code: "failed-precondition" });
    });
    // ─ Normal transcription ───────────────────────────────────────────
    it("filters no-speech segments and returns speech segments with sequential IDs", async () => {
        mockTranscriptionCreate.mockResolvedValueOnce({
            segments: [
                { id: 0, start: 0, end: 2, text: "Hello", no_speech_prob: 0.1 },
                { id: 1, start: 2, end: 4, text: "(noise)", no_speech_prob: 0.9 },
                { id: 2, start: 4, end: 6, text: "World", no_speech_prob: 0.2 },
            ],
            language: "korean",
        });
        const result = await handler({
            auth: { uid: "u1" },
            data: { audioBase64: validBase64, filename: "test.mp3" },
        });
        expect(result.segments).toHaveLength(2);
        expect(result.segments[0]).toMatchObject({
            id: "0",
            start_time: 0,
            end_time: 2,
            text: "Hello",
        });
        expect(result.segments[1]).toMatchObject({
            id: "1",
            start_time: 4,
            end_time: 6,
            text: "World",
        });
        expect(result.detected_language).toBe("ko");
    });
    // ─ Short-segment merge ────────────────────────────────────────────
    it("merges segments shorter than 0.5 s with previous neighbor", async () => {
        mockTranscriptionCreate.mockResolvedValueOnce({
            segments: [
                { id: 0, start: 0, end: 2, text: "First", no_speech_prob: 0.1 },
                { id: 1, start: 2, end: 2.3, text: "short", no_speech_prob: 0.1 }, // 0.3 s
                { id: 2, start: 2.3, end: 5, text: "Third", no_speech_prob: 0.1 },
            ],
            language: "english",
        });
        const result = await handler({
            auth: { uid: "u1" },
            data: { audioBase64: validBase64, filename: "test.mp3" },
        });
        expect(result.segments).toHaveLength(2);
        expect(result.segments[0]).toMatchObject({
            id: "0",
            start_time: 0,
            end_time: 2.3,
            text: "First short",
        });
        expect(result.segments[1]).toMatchObject({
            id: "1",
            start_time: 2.3,
            end_time: 5,
            text: "Third",
        });
        expect(result.detected_language).toBe("en");
    });
    // ─ Language mapping ───────────────────────────────────────────────
    it("maps Whisper language names to ISO codes", async () => {
        const langMap = {
            korean: "ko",
            english: "en",
            japanese: "ja",
            chinese: "zh",
            spanish: "es",
        };
        for (const [whisper, iso] of Object.entries(langMap)) {
            mockTranscriptionCreate.mockResolvedValueOnce({
                segments: [{ id: 0, start: 0, end: 1, text: "x", no_speech_prob: 0 }],
                language: whisper,
            });
            const result = await handler({
                auth: { uid: "u1" },
                data: { audioBase64: validBase64, filename: "test.mp3" },
            });
            expect(result.detected_language).toBe(iso);
        }
    });
    it("passes through unmapped language names as-is", async () => {
        mockTranscriptionCreate.mockResolvedValueOnce({
            segments: [{ id: 0, start: 0, end: 1, text: "x", no_speech_prob: 0 }],
            language: "swahili",
        });
        const result = await handler({
            auth: { uid: "u1" },
            data: { audioBase64: validBase64, filename: "test.mp3" },
        });
        expect(result.detected_language).toBe("swahili");
    });
    // ─ Usage logging ──────────────────────────────────────────────────
    it("logs usage to Firestore after successful transcription", async () => {
        mockTranscriptionCreate.mockResolvedValueOnce({
            segments: [{ id: 0, start: 0, end: 10, text: "Hello", no_speech_prob: 0 }],
            language: "english",
        });
        await handler({
            auth: { uid: "u1" },
            data: { audioBase64: validBase64, filename: "test.mp3" },
        });
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
            uid: "u1",
            service: "whisper",
            unit_type: "seconds",
        }));
    });
});
//# sourceMappingURL=transcribe.test.js.map