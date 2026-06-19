export enum FpsTier {
  LOW = 'low',
  STANDARD = 'standard',
  HIGH = 'high',
}

export enum UploadState {
  PENDING = 'pending',
  UPLOADING = 'uploading',
  UPLOADED = 'uploaded',
  FAILED = 'failed',
}

export enum NetworkType {
  WIFI = 'wifi',
  CELLULAR = 'cellular',
  NONE = 'none',
}

export interface VideoMetadata {
  video_id: string;
  worker_id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  file_size_bytes: number;
  fps: number;
  fps_tier: FpsTier;
  resolution: string;
  local_path: string;
  device_model: string;
  os_version: string;
  gps_latitude?: number;
  gps_longitude?: number;
  battery_start?: number;
  battery_end?: number;
  network_type_upload?: NetworkType;
  extensible_metadata?: Record<string, any>;
}

export interface VideoResponse extends VideoMetadata {
  worker_id: string;
  upload_state: UploadState;
  attempt_count: number;
  last_error: string | null;
  last_attempted_at: string | null;
  s3_bucket: string | null;
  s3_key: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PresignedUrlResponse {
  video_id: string;
  upload_url: string;
  s3_bucket: string;
  s3_key: string;
  headers: Record<string, string>;
  ttl_seconds: number;
}
