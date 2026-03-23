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
exports.youtubeCallback = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0)
    admin.initializeApp();
const googleClientId = (0, params_1.defineSecret)("GOOGLE_CLIENT_ID");
const googleClientSecret = (0, params_1.defineSecret)("GOOGLE_CLIENT_SECRET");
const googleRedirectUri = (0, params_1.defineSecret)("GOOGLE_REDIRECT_URI");
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const STATE_EXPIRY_SECONDS = 600; // 10 minutes
// ── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Format subscriber count for display (e.g. 12345 → "1.2만", 1500 → "1.5천").
 */
function formatSubscriberCount(countStr) {
    const count = parseInt(countStr, 10);
    if (isNaN(count))
        return countStr;
    if (count >= 10000) {
        const v = count / 10000;
        return v === Math.floor(v) ? `${Math.floor(v)}만` : `${v.toFixed(1)}만`;
    }
    if (count >= 1000) {
        const v = count / 1000;
        return v === Math.floor(v) ? `${Math.floor(v)}천` : `${v.toFixed(1)}천`;
    }
    return String(count);
}
// ── HTML Templates (ported 1:1 from Python) ─────────────────────────────────
function successHtml(channelCount) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YouTube 연동 완료</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .card {
            background: white; border-radius: 24px; padding: 48px;
            text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
            max-width: 400px;
        }
        .icon { font-size: 48px; margin-bottom: 16px; }
        h1 { font-size: 22px; color: #1a1a1a; margin: 0 0 8px; }
        p { font-size: 14px; color: #6b7280; margin: 0 0 24px; line-height: 1.5; }
        .close-btn {
            display: inline-block; padding: 12px 32px;
            background: #3b82f6; color: white; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 600; cursor: pointer;
            text-decoration: none;
        }
        .close-btn:hover { background: #2563eb; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">&#10004;&#65039;</div>
        <h1>YouTube 연동 완료!</h1>
        <p>${channelCount}개의 채널이 연결되었습니다.<br>이 창을 닫고 앱으로 돌아가주세요.</p>
        <button class="close-btn" onclick="window.close()">창 닫기</button>
    </div>
</body>
</html>`;
}
function errorHtml(message) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YouTube 연동 실패</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; margin: 0;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }
        .card {
            background: white; border-radius: 24px; padding: 48px;
            text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
            max-width: 400px;
        }
        .icon { font-size: 48px; margin-bottom: 16px; }
        h1 { font-size: 22px; color: #1a1a1a; margin: 0 0 8px; }
        p { font-size: 14px; color: #6b7280; margin: 0 0 24px; line-height: 1.5; }
        .close-btn {
            display: inline-block; padding: 12px 32px;
            background: #6b7280; color: white; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .close-btn:hover { background: #4b5563; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">&#9888;&#65039;</div>
        <h1>연동 실패</h1>
        <p>${message}</p>
        <button class="close-btn" onclick="window.close()">창 닫기</button>
    </div>
</body>
</html>`;
}
// ── Cloud Function (HTTP trigger — NOT onCall) ──────────────────────────────
exports.youtubeCallback = (0, https_1.onRequest)({ secrets: [googleClientId, googleClientSecret, googleRedirectUri] }, async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    if (!code || !state) {
        res.status(400).send(errorHtml("잘못된 요청입니다."));
        return;
    }
    const db = admin.firestore();
    // ── Validate state from Firestore ───────────────────────────────────
    const stateRef = db.collection("oauth_states").doc(state);
    const stateDoc = await stateRef.get();
    if (!stateDoc.exists) {
        res.status(400).send(errorHtml("인증 세션이 만료되었습니다. 다시 시도해주세요."));
        return;
    }
    const stateData = stateDoc.data();
    const now = Date.now() / 1000;
    // Check expiry
    if (now - stateData.created_at > STATE_EXPIRY_SECONDS) {
        await stateRef.delete();
        res.status(400).send(errorHtml("인증 세션이 만료되었습니다. 다시 시도해주세요."));
        return;
    }
    // Delete state (one-time use, like Python's dict.pop)
    await stateRef.delete();
    const uid = stateData.uid;
    // ── Exchange code for tokens ────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tokenData;
    try {
        const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: googleClientId.value(),
                client_secret: googleClientSecret.value(),
                redirect_uri: googleRedirectUri.value(),
                grant_type: "authorization_code",
            }).toString(),
        });
        if (!tokenResp.ok) {
            res.status(502).send(errorHtml("Google 인증 토큰 교환에 실패했습니다."));
            return;
        }
        tokenData = await tokenResp.json();
    }
    catch {
        res.status(502).send(errorHtml("Google 인증 토큰 교환에 실패했습니다."));
        return;
    }
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    if (!accessToken) {
        res.status(502).send(errorHtml("액세스 토큰을 받지 못했습니다."));
        return;
    }
    // ── Get Google user email ───────────────────────────────────────────
    let googleEmail = "";
    try {
        const userinfoResp = await fetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userinfoResp.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userinfo = await userinfoResp.json();
            googleEmail = userinfo.email || "";
        }
    }
    catch {
        // email is optional
    }
    // ── Get YouTube channels ────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ytData;
    try {
        const ytUrl = `${YOUTUBE_CHANNELS_URL}?${new URLSearchParams({
            part: "snippet,statistics",
            mine: "true",
        }).toString()}`;
        const ytResp = await fetch(ytUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!ytResp.ok) {
            res.status(502).send(errorHtml("YouTube 채널 정보를 가져오는데 실패했습니다."));
            return;
        }
        ytData = await ytResp.json();
    }
    catch {
        res.status(502).send(errorHtml("YouTube 채널 정보를 가져오는데 실패했습니다."));
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ytData.items || [];
    if (items.length === 0) {
        res.status(404).send(errorHtml("이 Google 계정에 연결된 YouTube 채널이 없습니다."));
        return;
    }
    // ── Store each channel in Firestore ─────────────────────────────────
    const nowTs = Date.now() / 1000;
    const channelsRef = db.collection("users").doc(uid).collection("youtube_channels");
    let storedCount = 0;
    for (const item of items) {
        const channelId = item.id || "";
        const snippet = item.snippet || {};
        const statistics = item.statistics || {};
        const existing = await channelsRef.doc(channelId).get();
        if (existing.exists) {
            // Update tokens only
            await channelsRef.doc(channelId).update({
                access_token: accessToken,
                refresh_token: refreshToken || existing.data()?.refresh_token || "",
                token_expiry: nowTs + expiresIn,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        else {
            // Create new connection
            await channelsRef.doc(channelId).set({
                channel_id: channelId,
                channel_title: snippet.title || "",
                thumbnail_url: snippet.thumbnails?.default?.url || "",
                subscriber_count: formatSubscriberCount(statistics.subscriberCount || "0"),
                google_email: googleEmail,
                access_token: accessToken,
                refresh_token: refreshToken || "",
                token_expiry: nowTs + expiresIn,
                connected_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        storedCount++;
    }
    res.status(200).send(successHtml(storedCount));
});
//# sourceMappingURL=callback.js.map