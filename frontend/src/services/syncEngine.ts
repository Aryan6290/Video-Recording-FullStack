import NetInfo from '@react-native-community/netinfo';
import { databaseService } from './database';
import { apiService } from './api';
import { VideoResponse, SyncListener, UploadState, NetworkType } from '../models';
import { BACKOFF, MAX_RETRIES } from '../data/constants';

class SyncEngine {
  private isProcessing = false;
  private listeners: Set<SyncListener> = new Set();

  constructor() {
    // Listen to network status changes to trigger sync
    NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        console.log('SyncEngine: Network restored. Waking up queue...');
        this.triggerSync();
      }
    });
  }

  /**
   * Register a listener for upload progress and status updates.
   */
  subscribe(listener: SyncListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: Parameters<SyncListener>[0]) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    });
  }

  /**
   * Trigger queue processing. Runs asynchronously.
   */
  async triggerSync(): Promise<void> {
    if (this.isProcessing) {
      console.log('SyncEngine: Queue worker is already active.');
      return;
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('SyncEngine: Offline. Sync suspended.');
      return;
    }

    this.isProcessing = true;
    try {
      await this.processQueue();
    } catch (error) {
      console.error('SyncEngine: Unexpected loop error', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process all eligible items in the queue sequentially.
   */
  private async processQueue(): Promise<void> {
    console.log('SyncEngine: Processing queue...');
    
    // Fetch all pending or failed items from database
    const queue = await databaseService.getUploadQueue();
    if (queue.length === 0) {
      console.log('SyncEngine: No items in sync queue.');
      return;
    }

    this.emit({ type: 'queue_change' });

    for (const video of queue) {
      // Check net state before each upload
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        console.log('SyncEngine: Network disconnected midway. Pausing sync.');
        break;
      }

      // Check exponential backoff for failed entries
      if (video.upload_state === 'failed') {
        if (video.attempt_count >= MAX_RETRIES) {
          console.log(`SyncEngine: Video ${video.video_id} exceeded maximum retries. Skipping.`);
          continue;
        }

        if (video.last_attempted_at) {
          const lastAttemptTime = new Date(video.last_attempted_at).getTime();
          // Backoff duration: BASE_MS * 2^(attempt_count - 1)
          const backoffDuration = Math.min(
            BACKOFF.BASE_MS * Math.pow(2, video.attempt_count - 1),
            BACKOFF.MAX_MS
          );
          
          if (Date.now() - lastAttemptTime < backoffDuration) {
            console.log(`SyncEngine: Video ${video.video_id} is in backoff period. Skipping.`);
            continue;
          }
        }
      }

      // Process individual upload
      await this.uploadVideo(video);
    }
  }

  /**
   * Perform the upload flow for a single video record.
   */
  private async uploadVideo(video: VideoResponse): Promise<void> {
    const videoId = video.video_id;
    console.log(`SyncEngine: Starting upload for video: ${videoId}`);
    
    // 1. Mark status as uploading
    const nextAttempt = video.attempt_count + 1;
    await databaseService.logUploadAttempt(
      videoId,
      UploadState.UPLOADING,
      nextAttempt,
      null,
      video.s3_bucket,
      video.s3_key
    );
    this.emit({ type: 'status_change', videoId, status: UploadState.UPLOADING });

    try {
      // Get updated network type right before upload
      const netState = await NetInfo.fetch();
      const networkType = netState.type === 'wifi' 
        ? NetworkType.WIFI 
        : netState.type === 'cellular' 
          ? NetworkType.CELLULAR 
          : NetworkType.NONE;

      // 2. Metadata Ingestion Handshake
      try {
        console.log(`SyncEngine: Registering metadata for video ${videoId}`);
        const metadataPayload = {
          video_id: video.video_id,
          worker_id: video.worker_id,
          started_at: video.started_at,
          ended_at: video.ended_at,
          duration_ms: video.duration_ms,
          file_size_bytes: video.file_size_bytes,
          fps: video.fps,
          fps_tier: video.fps_tier,
          resolution: video.resolution,
          local_path: video.local_path,
          device_model: video.device_model,
          os_version: video.os_version,
          gps_latitude: video.gps_latitude,
          gps_longitude: video.gps_longitude,
          battery_start: video.battery_start,
          battery_end: video.battery_end,
          network_type_upload: networkType,
          extensible_metadata: video.extensible_metadata,
        };
        await apiService.registerVideoMetadata(metadataPayload);
      } catch (metaErr: any) {
        // If API responds that metadata is already registered (400), we can proceed safely.
        const errorDetail = metaErr.response?.data?.detail;
        if (
          metaErr.response?.status === 400 && 
          typeof errorDetail === 'string' && 
          errorDetail.includes('already registered')
        ) {
          console.log(`SyncEngine: Metadata for ${videoId} is already registered. Proceeding to URL fetch.`);
        } else {
          throw metaErr;
        }
      }

      // 3. Request S3 Presigned URL
      console.log(`SyncEngine: Requesting presigned URL for ${videoId}`);
      const presignedData = await apiService.requestPresignedUrl(videoId, video.file_size_bytes);
      
      // Save S3 bucket/key values returned from endpoint
      await databaseService.logUploadAttempt(
        videoId,
        UploadState.UPLOADING,
        nextAttempt,
        null,
        presignedData.s3_bucket,
        presignedData.s3_key
      );

      // 4. Binary File PUT directly to S3
      console.log(`SyncEngine: Uploading file binary to S3 for ${videoId}`);
      await apiService.uploadFileToS3(
        presignedData.upload_url,
        video.local_path,
        presignedData.headers,
        (percent) => {
          this.emit({ type: 'progress', videoId, percent });
        }
      );

      // 5. Final Confirmation Handshake
      console.log(`SyncEngine: Confirming successful upload for ${videoId}`);
      await apiService.confirmUpload(videoId, true);

      await databaseService.logUploadAttempt(
        videoId,
        UploadState.UPLOADED,
        nextAttempt,
        null,
        presignedData.s3_bucket,
        presignedData.s3_key
      );
      this.emit({ type: 'status_change', videoId, status: UploadState.UPLOADED });
      console.log(`SyncEngine: Successfully uploaded and synced video ${videoId}`);

    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || 'Unknown upload error';
      console.error(`SyncEngine: Failed uploading video ${videoId}:`, errMsg);

      // Log failure with error detail
      await databaseService.logUploadAttempt(
        videoId,
        UploadState.FAILED,
        nextAttempt,
        errMsg,
        video.s3_bucket,
        video.s3_key
      );
      
      this.emit({ 
        type: 'status_change', 
        videoId, 
        status: UploadState.FAILED, 
        error: errMsg 
      });
    }
  }

  /**
   * Manually forces immediate retry of a failed upload, bypassing backoff delays.
   */
  async forceRetry(videoId: string, video: VideoResponse): Promise<void> {
    console.log(`SyncEngine: Force retrying video ${videoId} immediately.`);
    // Reset attempt count slightly to allow retry if maxed out
    const cleanAttempt = Math.min(video.attempt_count, MAX_RETRIES - 1);
    const refreshedVideo = { ...video, attempt_count: cleanAttempt, upload_state: UploadState.PENDING };
    
    // Update DB status to pending
    await databaseService.updateUploadStatus(videoId, UploadState.PENDING);
    this.emit({ type: 'status_change', videoId, status: UploadState.PENDING });

    // Run async upload process
    setTimeout(() => {
      this.uploadVideo(refreshedVideo).then(() => this.triggerSync());
    }, 100);
  }
}

export const syncEngine = new SyncEngine();
