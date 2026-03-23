"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.youtubeRefreshToken = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0)
    admin.initializeApp();
const googleClientId = (0, params_1.defineSecret)("GOOGLE_CLIENT_ID");
const googleClientSecret = (0, params_1.defineSecret)("GOOGLE_CLIENT_SECRET");
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BUFFER_SECONDS = 5 * 60; // 5 minutes
exports.youtubeRefreshToken = (0, https_1.onCall)({ secrets: [googleClientId, googleClientSecret] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "인증이 필요합니다");
    }
    const { channel_id } = request.data;
    if (!channel_id) {
        throw new https_1.HttpsError("invalid-argument", "channel_id가 필요합니다");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    // Get channel doc from Firestore
    const docRef = db
        .collection("users")
        .doc(uid)
        .collection("youtube_channels")
        .doc(channel_id);
    const doc = await docRef.get();
    if (!doc.exists) {
        throw new https_1.HttpsError("not-found", "연결된 채널을 찾을 수 없습니다");
    }
    const data = doc.data();
    const refreshTokenValue = data.refresh_token || "";
    // Resolve token_expiry (may be Firestore Timestamp or number)
    let tokenExpiry;
    if (data.token_expiry && typeof data.token_expiry.toMillis === "function") {
        tokenExpiry = data.token_expiry.toMillis() / 1000;
    }
    else if (typeof data.token_expiry === "number") {
        tokenExpiry = data.token_expiry;
    }
    else {
        tokenExpiry = 0; // Unknown → treat as expired
    }
    // Check if token is still valid (with 5 minute buffer)
    const now = Date.now() / 1000;
    if (now < tokenExpiry - BUFFER_SECONDS) {
        return { success: true, message: "토큰이 아직 유효합니다." };
    }
    // Token expired — refresh it
    if (!refreshTokenValue) {
        throw new https_1.HttpsError("unauthenticated", "YouTube 채널 인증이 만료되었습니다. 설정에서 채널을 다시 연결해주세요.");
    }
    try {
        const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: googleClientId.value(),
                client_secret: googleClientSecret.value(),
                refresh_token: refreshTokenValue,
                grant_type: "refresh_token",
            }).toString(),
        });
        if (!tokenResp.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errorData = await tokenResp.json().catch(() => ({}));
            if (errorData.error === "invalid_grant") {
                throw new https_1.HttpsError("unauthenticated", "YouTube 채널 인증이 만료되었습니다. 설정에서 채널을 다시 연결해주세요.");
            }
            throw new https_1.HttpsError("internal", "토큰 갱신 중 오류가 발생했습니다.");
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tokens = await tokenResp.json();
        const newAccessToken = tokens.access_token;
        const expiresIn = tokens.expires_in || 3600;
        if (!newAccessToken) {
            throw new https_1.HttpsError("internal", "토큰 갱신 중 오류가 발생했습니다.");
        }
        // Update Firestore with new token and expiry
        await docRef.update({
            access_token: newAccessToken,
            token_expiry: Date.now() / 1000 + expiresIn,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true, message: "토큰이 갱신되었습니다." };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError("internal", "토큰 갱신 중 오류가 발생했습니다.");
    }
});
//# sourceMappingURL=refreshToken.js.map