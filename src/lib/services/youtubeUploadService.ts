import { readFile } from '@tauri-apps/plugin-fs';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { callRefreshToken } from '../cloudFunctions';

export async function uploadToYoutube(
  uid: string,
  channelId: string,
  filePath: string,
  title: string,
  description: string,
  language: string,
): Promise<{ video_id: string; video_url: string; status: string }> {
  if (!db) throw new Error('Firestore를 사용할 수 없습니다');

  // 1. Firestore에서 토큰 읽기
  const channelDoc = await getDoc(doc(db, 'users', uid, 'youtube_channels', channelId));
  if (!channelDoc.exists()) throw new Error('채널을 찾을 수 없습니다');
  let { access_token, token_expiry } = channelDoc.data();

  // 2. 토큰 만료 확인 → 갱신
  if (Date.now() / 1000 > (token_expiry - 300)) {
    await callRefreshToken({ channel_id: channelId });
    // Re-read updated token
    const refreshed = await getDoc(doc(db, 'users', uid, 'youtube_channels', channelId));
    access_token = refreshed.data()?.access_token;
  }

  // 3. 로컬 파일 읽기 (Tauri)
  const fileBytes = await readFile(filePath);

  // 4. YouTube resumable upload
  // Step A: Create upload session
  const metadata = {
    snippet: { title, description, defaultLanguage: language, categoryId: '22' },
    status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
  };
  const initResp = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(fileBytes.length),
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initResp.ok) {
    const err = await initResp.text();
    throw new Error(`YouTube 업로드 세션 생성 실패: ${err}`);
  }
  const uploadUrl = initResp.headers.get('location');
  if (!uploadUrl) throw new Error('업로드 URL을 받지 못했습니다');

  // Step B: Upload video bytes
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: fileBytes,
  });
  if (!uploadResp.ok) {
    const err = await uploadResp.text();
    throw new Error(`YouTube 업로드 실패: ${err}`);
  }
  const result = await uploadResp.json();

  return {
    video_id: result.id,
    video_url: `https://www.youtube.com/watch?v=${result.id}`,
    status: result.status?.uploadStatus || 'uploaded',
  };
}
