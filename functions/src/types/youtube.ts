export interface YouTubeAuthUrlResponse {
  auth_url: string;
}

export interface YouTubeChannelResponse {
  id: string;
  channel_id: string;
  channel_title: string;
  thumbnail_url: string;
  subscriber_count: string;
  google_email: string;
  connected_at: string; // ISO datetime
}

export interface YouTubeConnectionsResponse {
  channels: YouTubeChannelResponse[];
}

export interface YouTubeMetadataRequest {
  subtitle_text: string;
  language: string;
}

export interface YouTubeMetadataResponse {
  title: string;
  description: string;
  hashtags: string[];
}

// Note: YouTube upload is handled by frontend directly
// These types remain for completeness
export interface YouTubeUploadRequest {
  channel_id: string;
  file_path: string;
  title: string;
  description: string;
  language: string;
}

export interface YouTubeUploadResponse {
  video_id: string;
  video_url: string;
  status: string;
}

// Internal Firestore document type
export interface YouTubeChannelDoc {
  channel_id: string;
  channel_title: string;
  thumbnail_url: string;
  subscriber_count: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: number; // Unix timestamp
  connected_at: any; // Firestore Timestamp
  updated_at: any; // Firestore Timestamp
}

// OAuth state stored in Firestore
export interface OAuthState {
  uid: string;
  created_at: number; // Unix timestamp
}
