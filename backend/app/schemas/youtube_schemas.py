from pydantic import BaseModel


class YouTubeUploadRequest(BaseModel):
    channel_id: str
    file_path: str
    title: str
    description: str
    language: str


class YouTubeUploadResponse(BaseModel):
    video_id: str
    video_url: str
    status: str


class YouTubeMetadataRequest(BaseModel):
    subtitle_text: str
    language: str


class YouTubeMetadataResponse(BaseModel):
    title: str
    description: str
    hashtags: list[str]


