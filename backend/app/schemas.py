from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Dict, Any
from datetime import datetime

# ==========================================
# Auth Schemas
# ==========================================

class LoginRequest(BaseModel):
    email_or_phone: str = Field(..., description="Worker's registered email or phone number")
    password: str = Field(..., min_length=6, description="Plaintext password (mocked auth accepts any password >= 6 chars)")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    worker_id: str

class TokenData(BaseModel):
    worker_id: Optional[str] = None

# ==========================================
# Video Ingestion Schemas
# ==========================================

class VideoMetadataBase(BaseModel):
    video_id: str = Field(..., description="UUID v4 generated on capture start")
    started_at: datetime = Field(..., description="ISO 8601 timestamp at recording press")
    ended_at: datetime = Field(..., description="ISO 8601 timestamp at stop or limit")
    duration_ms: int = Field(..., ge=0, description="Millisecond precision duration")
    file_size_bytes: int = Field(..., ge=0, description="Post-recording file size")
    fps: float = Field(..., description="Frames per second from camera API")
    fps_tier: str = Field(..., pattern="^(low|standard|high)$", description="FPS classification tier")
    resolution: str = Field(..., description="Video resolution (e.g. 1920x1080)")
    local_path: str = Field(..., description="Absolute file path on local device storage")
    device_model: str = Field(..., description="Device hardware model name")
    os_version: str = Field(..., description="Android operating system version")

    # Optional metadata (Bonus Signals)
    gps_latitude: Optional[float] = Field(None, ge=-90, le=90)
    gps_longitude: Optional[float] = Field(None, ge=-180, le=180)
    battery_start: Optional[float] = Field(None, ge=0, le=100)
    battery_end: Optional[float] = Field(None, ge=0, le=100)
    network_type_upload: Optional[str] = Field(None, pattern="^(wifi|cellular|none)$")
    
    # Extensible payload
    extensible_metadata: Optional[Dict[str, Any]] = Field(None, description="Arbitrary metadata parameters")

class VideoCreate(VideoMetadataBase):
    pass

class VideoResponse(VideoMetadataBase):
    worker_id: str
    upload_state: str
    attempt_count: int
    last_error: Optional[str] = None
    last_attempted_at: Optional[datetime] = None
    s3_bucket: Optional[str] = None
    s3_key: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==========================================
# Presigned URL Schemas
# ==========================================

class PresignedUrlRequest(BaseModel):
    video_id: str = Field(..., description="Unique ID of the video to upload")
    file_size_bytes: int = Field(..., ge=0, description="Size of the file being uploaded in bytes")

class PresignedUrlResponse(BaseModel):
    video_id: str
    upload_url: str = Field(..., description="Scoped S3 Presigned PUT URL")
    s3_bucket: str
    s3_key: str
    headers: Dict[str, str] = Field(default_factory=dict, description="Headers required for S3 upload (e.g., Content-Type)")
    ttl_seconds: int

# ==========================================
# Upload Confirmation Schemas
# ==========================================

class UploadConfirmationRequest(BaseModel):
    video_id: str
    etag: Optional[str] = Field(None, description="S3 ETag returned from S3 PUT response (if verifying client-side)")
    succeeded: bool = Field(True, description="Indicates whether client considers the upload completed")
    error_message: Optional[str] = None
