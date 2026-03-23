import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (admin.apps.length === 0) admin.initializeApp();

const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");
const googleRedirectUri = defineSecret("GOOGLE_REDIRECT_URI");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export const youtubeAuthUrl = onCall(
  {cors: true, invoker: "public", secrets: [googleClientId, googleClientSecret, googleRedirectUri]},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증이 필요합니다");
    }

    if (!googleClientId.value() || !googleClientSecret.value()) {
      throw new HttpsError(
        "unavailable",
        "Google OAuth가 설정되지 않았습니다. GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 설정해주세요."
      );
    }

    const state = crypto.randomBytes(32).toString("base64url");
    const db = admin.firestore();

    // Store state in Firestore (NOT in-memory)
    await db.collection("oauth_states").doc(state).set({
      uid: request.auth.uid,
      created_at: Date.now() / 1000,
    });

    const params = new URLSearchParams({
      client_id: googleClientId.value(),
      redirect_uri: googleRedirectUri.value(),
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    return {auth_url: authUrl};
  }
);
