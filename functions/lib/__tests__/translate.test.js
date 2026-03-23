"use strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
// ── Mocks ───────────────────────────────────────────────────────────────
const mockChatCreate = jest.fn();
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
        chat: { completions: { create: mockChatCreate } },
    })),
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
// ── Imports ─────────────────────────────────────────────────────────────
const translate_1 = require("../pipeline/translate");
const handler = translate_1.translate;
// ── Helpers ─────────────────────────────────────────────────────────────
function seg(id, text) {
    return { id, start_time: Number(id), end_time: Number(id) + 1, text };
}
function batchReply(translations, tokens = 100) {
    return {
        choices: [{ message: { content: JSON.stringify({ translations }) } }],
        usage: { total_tokens: tokens },
    };
}
function singleReply(translation, tokens = 50) {
    return {
        choices: [{ message: { content: JSON.stringify({ translation }) } }],
        usage: { total_tokens: tokens },
    };
}
// ── Tests ───────────────────────────────────────────────────────────────
describe("translate", () => {
    beforeEach(() => jest.clearAllMocks());
    // ─ Auth ────────────────────────────────────────────────────────────
    it("rejects unauthenticated requests", async () => {
        await expect(handler({
            data: {
                segments: [seg("0", "hi")],
                source_language: "en",
                target_language: "ko",
            },
        })).rejects.toMatchObject({ code: "unauthenticated" });
    });
    // ─ Validation ─────────────────────────────────────────────────────
    it("rejects unsupported source language", async () => {
        await expect(handler({
            auth: { uid: "u1" },
            data: {
                segments: [seg("0", "hi")],
                source_language: "xx",
                target_language: "ko",
            },
        })).rejects.toMatchObject({ code: "invalid-argument" });
    });
    it("rejects unsupported target language", async () => {
        await expect(handler({
            auth: { uid: "u1" },
            data: {
                segments: [seg("0", "hi")],
                source_language: "en",
                target_language: "fr",
            },
        })).rejects.toMatchObject({ code: "invalid-argument" });
    });
    it("rejects empty segments array", async () => {
        await expect(handler({
            auth: { uid: "u1" },
            data: { segments: [], source_language: "en", target_language: "ko" },
        })).rejects.toMatchObject({ code: "invalid-argument" });
    });
    // ─ Batch translation (2+ segments) ────────────────────────────────
    it("translates multiple segments via batch path", async () => {
        mockChatCreate.mockResolvedValueOnce(batchReply(["안녕", "세계"]));
        const result = await handler({
            auth: { uid: "u1" },
            data: {
                segments: [seg("0", "Hello"), seg("1", "World")],
                source_language: "en",
                target_language: "ko",
            },
        });
        expect(result.segments).toHaveLength(2);
        expect(result.segments[0].translated_text).toBe("안녕");
        expect(result.segments[0].original_text).toBe("Hello");
        expect(result.segments[1].translated_text).toBe("세계");
        expect(result.source_language).toBe("en");
        expect(result.target_language).toBe("ko");
    });
    // ─ Single translation (1 segment) ─────────────────────────────────
    it("uses single-prompt path for 1 segment", async () => {
        mockChatCreate.mockResolvedValueOnce(singleReply("안녕"));
        const result = await handler({
            auth: { uid: "u1" },
            data: {
                segments: [seg("0", "Hello")],
                source_language: "en",
                target_language: "ko",
            },
        });
        expect(result.segments).toHaveLength(1);
        expect(result.segments[0].translated_text).toBe("안녕");
        expect(mockChatCreate).toHaveBeenCalledTimes(1);
    });
    // ─ stripNumbering ─────────────────────────────────────────────────
    it("strips [N] numbering prefixes from translations", async () => {
        mockChatCreate.mockResolvedValueOnce(batchReply(["[1] 번역된 텍스트", "[2] 두번째 번역"]));
        const result = await handler({
            auth: { uid: "u1" },
            data: {
                segments: [seg("0", "Text one"), seg("1", "Text two")],
                source_language: "en",
                target_language: "ko",
            },
        });
        expect(result.segments[0].translated_text).toBe("번역된 텍스트");
        expect(result.segments[1].translated_text).toBe("두번째 번역");
    });
    // ─ Count mismatch recovery ────────────────────────────────────────
    it("fills gaps individually when batch returns fewer translations", async () => {
        // 1st call: batch returns only 1 of 2
        mockChatCreate.mockResolvedValueOnce(batchReply(["안녕"]));
        // 2nd call: individual fallback for missing segment
        mockChatCreate.mockResolvedValueOnce(singleReply("세계"));
        const result = await handler({
            auth: { uid: "u1" },
            data: {
                segments: [seg("0", "Hello"), seg("1", "World")],
                source_language: "en",
                target_language: "ko",
            },
        });
        expect(result.segments).toHaveLength(2);
        expect(result.segments[0].translated_text).toBe("안녕");
        expect(result.segments[1].translated_text).toBe("세계");
        expect(mockChatCreate).toHaveBeenCalledTimes(2);
    });
    it("truncates when batch returns more translations than expected", async () => {
        mockChatCreate.mockResolvedValueOnce(batchReply(["안녕", "세계", "추가"]));
        const result = await handler({
            auth: { uid: "u1" },
            data: {
                segments: [seg("0", "Hello"), seg("1", "World")],
                source_language: "en",
                target_language: "ko",
            },
        });
        expect(result.segments).toHaveLength(2);
        expect(result.segments[0].translated_text).toBe("안녕");
        expect(result.segments[1].translated_text).toBe("세계");
    });
    it("falls back to all-individual when batch parse fails entirely", async () => {
        // 1st call: batch returns unparseable content
        mockChatCreate.mockResolvedValueOnce({
            choices: [{ message: { content: "not valid json!!!" } }],
            usage: { total_tokens: 10 },
        });
        // 2nd + 3rd calls: individual fallback for each segment
        mockChatCreate.mockResolvedValueOnce(singleReply("안녕"));
        mockChatCreate.mockResolvedValueOnce(singleReply("세계"));
        const result = await handler({
            auth: { uid: "u1" },
            data: {
                segments: [seg("0", "Hello"), seg("1", "World")],
                source_language: "en",
                target_language: "ko",
            },
        });
        expect(result.segments).toHaveLength(2);
        expect(result.segments[0].translated_text).toBe("안녕");
        expect(result.segments[1].translated_text).toBe("세계");
        // 1 batch attempt + 2 individual
        expect(mockChatCreate).toHaveBeenCalledTimes(3);
    });
    // ─ Preserves timestamps ───────────────────────────────────────────
    it("preserves original segment timestamps and IDs", async () => {
        mockChatCreate.mockResolvedValueOnce(batchReply(["T1", "T2"]));
        const s0 = { id: "a", start_time: 1.5, end_time: 3.2, text: "src1" };
        const s1 = { id: "b", start_time: 3.2, end_time: 5.0, text: "src2" };
        const result = await handler({
            auth: { uid: "u1" },
            data: { segments: [s0, s1], source_language: "ko", target_language: "en" },
        });
        expect(result.segments[0]).toMatchObject({
            id: "a",
            start_time: 1.5,
            end_time: 3.2,
            original_text: "src1",
            translated_text: "T1",
        });
        expect(result.segments[1]).toMatchObject({
            id: "b",
            start_time: 3.2,
            end_time: 5.0,
        });
    });
    // ─ Usage logging ──────────────────────────────────────────────────
    it("logs token usage to Firestore", async () => {
        mockChatCreate.mockResolvedValueOnce(singleReply("안녕", 42));
        await handler({
            auth: { uid: "u1" },
            data: {
                segments: [seg("0", "Hello")],
                source_language: "en",
                target_language: "ko",
            },
        });
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
            uid: "u1",
            service: "gpt-translate",
            units: 42,
            unit_type: "tokens",
        }));
    });
});
//# sourceMappingURL=translate.test.js.map