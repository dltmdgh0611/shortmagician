import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export interface YouTubeChannel {
  id: string;           // Firestore document ID
  channel_id: string;
  channel_title: string;
  thumbnail_url: string;
  subscriber_count: string;
  google_email: string;
  connected_at: string; // ISO
}

export async function listConnections(uid: string): Promise<YouTubeChannel[]> {
  if (!db) throw new Error('Firestore를 사용할 수 없습니다');
  const channelsRef = collection(db, 'users', uid, 'youtube_channels');
  const snapshot = await getDocs(channelsRef);
  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data(),
    connected_at: d.data().connected_at?.toDate?.()?.toISOString?.() || '',
  })) as YouTubeChannel[];
}

export async function disconnectChannel(uid: string, channelId: string): Promise<void> {
  if (!db) throw new Error('Firestore를 사용할 수 없습니다');
  const docRef = doc(db, 'users', uid, 'youtube_channels', channelId);
  await deleteDoc(docRef);
}
