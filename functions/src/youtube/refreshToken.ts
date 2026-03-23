import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();

const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BUFFER_SECONDS = 5 * 60; // 5 minutes

export const youtubeRefreshToken = onCall(
  {secrets: [googleClientId, googleClientSecret]},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증이 필요합니다");
    }

    const {channel_id} = request.data as {channel_id: string};
    if (!channel_id) {
      throw new HttpsError("invalid-argument", "channel_id가 필요합니다");
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
      throw new HttpsError("not-found", "연결된 채널을 찾을 수 없습니다");
    }

    const data = doc.data()!;
    const refreshTokenValue: string = data.refresh_token || "";

    // Resolve token_expiry (may be Firestore Timestamp or number)
    let tokenExpiry: number;
    if (data.token_expiry && typeof data.token_expiry.toMillis === "function") {
      tokenExpiry = data.token_expiry.toMillis() / 1000;
    } else if (typeof data.token_expiry === "number") {
      tokenExpiry = data.token_expiry;
    } else {
      tokenExpiry = 0; // Unknown → treat as expired
    }

    // Check if token is still valid (with 5 minute buffer)
    const now = Date.now() / 1000;
    if (now < tokenExpiry - BUFFER_SECONDS) {
      return {success: true, message: "토큰이 아직 유효합니다."};
    }

    // Token expired — refresh it
    if (!refreshTokenValue) {
      throw new HttpsError(
        "unauthenticated",
        "YouTube 채널 인증이 만료되었습니다. 설정에서 채널을 다시 연결해주세요."
      );
    }

    try {
      const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
          client_id: googleClientId.value(),
          client_secret: googleClientSecret.value(),
          refresh_token: refreshTokenValue,
          grant_type: "refresh_token",
        }).toString(),
      });

      if (!tokenResp.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorData: any = await tokenResp.json().catch(() => ({}));
        if (errorData.error === "invalid_grant") {
          throw new HttpsError(
            "unauthenticated",
            "YouTube 채널 인증이 만료되었습니다. 설정에서 채널을 다시 연결해주세요."
          );
        }
        throw new HttpsError("internal", "토큰 갱신 중 오류가 발생했습니다.");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokens: any = await tokenResp.json();
      const newAccessToken: string | undefined = tokens.access_token;
      const expiresIn: number = tokens.expires_in || 3600;

      if (!newAccessToken) {
        throw new HttpsError("internal", "토큰 갱신 중 오류가 발생했습니다.");
      }

      // Update Firestore with new token and expiry
      await docRef.update({
        access_token: newAccessToken,
        token_expiry: Date.now() / 1000 + expiresIn,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {success: true, message: "토큰이 갱신되었습니다."};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", "토큰 갱신 중 오류가 발생했습니다.");
    }
  }
);
