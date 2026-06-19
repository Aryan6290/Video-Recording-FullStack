import { VideoMetadata, VideoResponse } from '../models';

// Define DB interface for both SQLite and in-memory fallback
interface IDatabase {
  execute(sql: string, params?: any[]): { rows?: { _array: any[] } };
}

let db: IDatabase | null = null;
let isInMemoryFallback = false;

// Attempt to initialize react-native-quick-sqlite
try {
  const { open } = require('react-native-quick-sqlite');
  db = open({ name: 'video_capture.db' });
  console.log('Successfully opened SQLite database via react-native-quick-sqlite');
} catch (error) {
  console.warn(
    'react-native-quick-sqlite is not available (native module missing in test/simulator environment). Falling back to in-memory store.',
    error
  );
  isInMemoryFallback = true;
}

// In-Memory storage implementation for fallback
class InMemoryDatabase implements IDatabase {
  private store: Map<string, any> = new Map();

  execute(sql: string, params: any[] = []): { rows?: { _array: any[] } } {
    const query = sql.trim().toLowerCase();
    
    if (query.startsWith('create table') || query.startsWith('create index')) {
      return {};
    }

    if (query.startsWith('insert into videos')) {
      // Params mapping to Video fields (based on insert query)
      const video: any = {
        video_id: params[0],
        worker_id: params[1],
        started_at: params[2],
        ended_at: params[3],
        duration_ms: params[4],
        file_size_bytes: params[5],
        fps: params[6],
        fps_tier: params[7],
        resolution: params[8],
        local_path: params[9],
        device_model: params[10],
        os_version: params[11],
        gps_latitude: params[12],
        gps_longitude: params[13],
        battery_start: params[14],
        battery_end: params[15],
        network_type_upload: params[16],
        extensible_metadata: params[17],
        upload_state: params[18] || 'pending',
        attempt_count: params[19] || 0,
        last_error: params[20] || null,
        last_attempted_at: params[21] || null,
        s3_bucket: params[22] || null,
        s3_key: params[23] || null,
        created_at: new Date().toISOString(),
      };
      this.store.set(video.video_id, video);
      return {};
    }

    if (query.startsWith('select') && query.includes('from videos')) {
      let list = Array.from(this.store.values());

      // Parse where filter if needed
      if (query.includes('worker_id =') || query.includes('worker_id=')) {
        // Find worker_id in params
        const workerId = params[0];
        list = list.filter((v) => v.worker_id === workerId);
      }

      // Check upload state filter
      if (query.includes('upload_state =') || query.includes('upload_state=')) {
        // e.g. WHERE upload_state = ?
        const stateIdx = query.indexOf('upload_state = ?') !== -1 
          ? params.indexOf('pending') !== -1 ? params.indexOf('pending') : params.indexOf('failed') 
          : -1;
        if (stateIdx !== -1) {
          const targetState = params[stateIdx];
          list = list.filter((v) => v.upload_state === targetState);
        } else if (query.includes("upload_state in ('pending', 'failed')")) {
          list = list.filter((v) => v.upload_state === 'pending' || v.upload_state === 'failed');
        }
      }

      // Ordering: started_at DESC
      list.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

      // Cursor Pagination filter
      // (started_at < cursor OR (started_at = cursor AND video_id < id))
      if (query.includes('started_at <') && params.length >= 2) {
        const cursorTime = params[1]; // started_at
        const cursorId = params[2];   // video_id
        
        list = list.filter((v) => {
          const tV = new Date(v.started_at).getTime();
          const tC = new Date(cursorTime).getTime();
          if (tV < tC) return true;
          if (tV === tC && v.video_id < cursorId) return true;
          return false;
        });
      }

      // Limit filter
      if (query.includes('limit')) {
        const limitStr = query.split('limit')[1].trim().split(' ')[0];
        const limit = parseInt(limitStr, 10) || 20;
        list = list.slice(0, limit);
      }

      return { rows: { _array: list } };
    }

    if (query.startsWith('update videos')) {
      // UPDATE videos SET upload_state = ?, ... WHERE video_id = ?
      // Find video_id in params (usually last parameter)
      const videoId = params[params.length - 1];
      const video = this.store.get(videoId);
      if (video) {
        if (query.includes('upload_state =') && query.includes('attempt_count =')) {
          // Sync engine update
          // SET upload_state = ?, attempt_count = ?, last_error = ?, last_attempted_at = ?, s3_bucket = ?, s3_key = ?
          video.upload_state = params[0];
          video.attempt_count = params[1];
          video.last_error = params[2];
          video.last_attempted_at = params[3];
          video.s3_bucket = params[4];
          video.s3_key = params[5];
        } else if (query.includes('upload_state =')) {
          // Status update
          video.upload_state = params[0];
          if (params[1]) video.last_error = params[1];
        }
        this.store.set(videoId, video);
      }
      return {};
    }

    if (query.startsWith('delete from videos')) {
      const videoId = params[0];
      this.store.delete(videoId);
      return {};
    }

    return {};
  }
}

if (!db) {
  db = new InMemoryDatabase();
}

export const databaseService = {
  /**
   * Initializes local SQLite database tables and optimization indexes.
   */
  async initDb(): Promise<void> {
    try {
      // 1. Create table matching SYSTEM_DESIGN.md specifications
      db!.execute(`
        CREATE TABLE IF NOT EXISTS videos (
          video_id TEXT PRIMARY KEY NOT NULL,
          worker_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT NOT NULL,
          duration_ms INTEGER NOT NULL,
          file_size_bytes INTEGER NOT NULL,
          fps REAL NOT NULL,
          fps_tier TEXT CHECK(fps_tier IN ('low', 'standard', 'high')) NOT NULL,
          resolution TEXT NOT NULL,
          local_path TEXT NOT NULL,
          device_model TEXT NOT NULL,
          os_version TEXT NOT NULL,
          gps_latitude REAL,
          gps_longitude REAL,
          battery_start REAL,
          battery_end REAL,
          network_type_upload TEXT CHECK(network_type_upload IN ('wifi', 'cellular', 'none')),
          extensible_metadata TEXT,
          upload_state TEXT CHECK(upload_state IN ('pending', 'uploading', 'uploaded', 'failed')) DEFAULT 'pending' NOT NULL,
          attempt_count INTEGER DEFAULT 0 NOT NULL,
          last_error TEXT,
          last_attempted_at TEXT,
          s3_bucket TEXT,
          s3_key TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Create index for query queue (Pending/Failed status)
      db!.execute(`
        CREATE INDEX IF NOT EXISTS idx_videos_upload_queue 
        ON videos(upload_state, last_attempted_at) 
        WHERE upload_state IN ('pending', 'failed');
      `);

      // 3. Create composite index for dashboard history
      db!.execute(`
        CREATE INDEX IF NOT EXISTS idx_videos_worker_history 
        ON videos(worker_id, started_at DESC, video_id DESC);
      `);

      // 4. Try to enable Write-Ahead Logging (WAL) for SQLite concurrency (Q4 Mitigation)
      if (!isInMemoryFallback) {
        try {
          db!.execute('PRAGMA journal_mode = WAL;');
          db!.execute('PRAGMA synchronous = NORMAL;');
          console.log('SQLite WAL mode enabled for high concurrency');
        } catch (pragmaErr) {
          console.warn('Failed to set WAL pragma:', pragmaErr);
        }
      }
    } catch (e) {
      console.error('Failed to initialize database tables', e);
      throw e;
    }
  },

  /**
   * Saves a newly recorded video metadata object into the SQLite queue database.
   */
  async saveVideo(metadata: VideoMetadata): Promise<void> {
    try {
      const sql = `
        INSERT INTO videos (
          video_id, worker_id, started_at, ended_at, duration_ms, file_size_bytes, 
          fps, fps_tier, resolution, local_path, device_model, os_version, gps_latitude, gps_longitude, 
          battery_start, battery_end, network_type_upload, extensible_metadata,
          upload_state, attempt_count, last_error, last_attempted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      
      const extensibleMetaStr = metadata.extensible_metadata 
        ? JSON.stringify(metadata.extensible_metadata) 
        : null;

      const params = [
        metadata.video_id,
        metadata.worker_id,
        metadata.started_at,
        metadata.ended_at,
        metadata.duration_ms,
        metadata.file_size_bytes,
        metadata.fps,
        metadata.fps_tier,
        metadata.resolution,
        metadata.local_path,
        metadata.device_model,
        metadata.os_version,
        metadata.gps_latitude ?? null,
        metadata.gps_longitude ?? null,
        metadata.battery_start ?? null,
        metadata.battery_end ?? null,
        metadata.network_type_upload ?? null,
        extensibleMetaStr,
        'pending', // upload_state
        0,         // attempt_count
        null,      // last_error
        null,      // last_attempted_at
      ];

      db!.execute(sql, params);
      console.log(`Video metadata saved in local DB with ID: ${metadata.video_id}`);
    } catch (e) {
      console.error('Failed to save video metadata locally', e);
      throw e;
    }
  },

  /**
   * Fetches outstanding videos in queue (PENDING or FAILED upload states).
   */
  async getUploadQueue(): Promise<VideoResponse[]> {
    try {
      const sql = `
        SELECT * FROM videos 
        WHERE upload_state IN ('pending', 'failed')
        ORDER BY last_attempted_at ASC, created_at ASC;
      `;
      const result = db!.execute(sql);
      const rows = result.rows?._array || [];
      return rows.map(this.mapDbRowToVideo);
    } catch (e) {
      console.error('Failed to query upload queue', e);
      return [];
    }
  },

  /**
   * Fetches video dashboard feed with keyset cursor pagination.
   */
  async getVideosPaged(
    workerId: string,
    limit: number = 20,
    cursorTimestamp?: string,
    cursorId?: string
  ): Promise<VideoResponse[]> {
    try {
      let sql = '';
      let params: any[] = [];

      if (cursorTimestamp && cursorId) {
        sql = `
          SELECT * FROM videos
          WHERE worker_id = ?
            AND (started_at < ? OR (started_at = ? AND video_id < ?))
          ORDER BY started_at DESC, video_id DESC
          LIMIT ?;
        `;
        params = [workerId, cursorTimestamp, cursorTimestamp, cursorId, limit];
      } else {
        sql = `
          SELECT * FROM videos
          WHERE worker_id = ?
          ORDER BY started_at DESC, video_id DESC
          LIMIT ?;
        `;
        params = [workerId, limit];
      }

      const result = db!.execute(sql, params);
      const rows = result.rows?._array || [];
      return rows.map(this.mapDbRowToVideo);
    } catch (e) {
      console.error('Failed to fetch paged videos from SQLite', e);
      return [];
    }
  },

  /**
   * Updates state of a video in the SQLite database.
   */
  async updateUploadStatus(
    videoId: string,
    state: 'pending' | 'uploading' | 'uploaded' | 'failed',
    error?: string
  ): Promise<void> {
    try {
      const sql = `
        UPDATE videos 
        SET upload_state = ?, last_error = ? 
        WHERE video_id = ?;
      `;
      db!.execute(sql, [state, error || null, videoId]);
    } catch (e) {
      console.error(`Failed to update upload status for video ${videoId}`, e);
    }
  },

  /**
   * Extended update specifically for sync attempt logging.
   */
  async logUploadAttempt(
    videoId: string,
    state: 'uploading' | 'uploaded' | 'failed',
    attemptCount: number,
    error: string | null,
    s3Bucket: string | null,
    s3Key: string | null
  ): Promise<void> {
    try {
      const sql = `
        UPDATE videos 
        SET upload_state = ?, 
            attempt_count = ?, 
            last_error = ?, 
            last_attempted_at = ?,
            s3_bucket = ?,
            s3_key = ?
        WHERE video_id = ?;
      `;
      const lastAttemptedAt = new Date().toISOString();
      db!.execute(sql, [state, attemptCount, error, lastAttemptedAt, s3Bucket, s3Key, videoId]);
    } catch (e) {
      console.error(`Failed to log upload attempt for video ${videoId}`, e);
    }
  },

  /**
   * Deletes local path entry from SQLite (to indicate local cleanup) or deletes the record.
   * Based on assignment: "Actions: delete local file". We can delete the local video file
   * on disk and null out local_path in DB, or delete the DB entry. Standard is to null out
   * local_path so the record itself is still visible on the Dashboard (downloadable/synced state)
   * but the local storage is freed up. Let's do that!
   */
  async clearLocalPath(videoId: string): Promise<void> {
    try {
      const sql = `
        UPDATE videos 
        SET local_path = '' 
        WHERE video_id = ?;
      `;
      db!.execute(sql, [videoId]);
      console.log(`Cleared local path in DB for video: ${videoId}`);
    } catch (e) {
      console.error(`Failed to clear local path for video ${videoId}`, e);
    }
  },

  /**
   * Delete entire record (if needed).
   */
  async deleteVideoRecord(videoId: string): Promise<void> {
    try {
      db!.execute('DELETE FROM videos WHERE video_id = ?;', [videoId]);
    } catch (e) {
      console.error(`Failed to delete record ${videoId}`, e);
    }
  },

  /**
   * Map database row to standard VideoResponse.
   */
  mapDbRowToVideo(row: any): VideoResponse {
    let extMeta: Record<string, any> = {};
    if (row.extensible_metadata) {
      try {
        extMeta = typeof row.extensible_metadata === 'string' 
          ? JSON.parse(row.extensible_metadata) 
          : row.extensible_metadata;
      } catch (err) {
        console.warn('Failed to parse extensible_metadata JSON', err);
      }
    }

    return {
      video_id: row.video_id,
      worker_id: row.worker_id,
      started_at: row.started_at,
      ended_at: row.ended_at,
      duration_ms: Number(row.duration_ms),
      file_size_bytes: Number(row.file_size_bytes),
      fps: Number(row.fps),
      fps_tier: row.fps_tier,
      resolution: row.resolution,
      local_path: row.local_path,
      device_model: row.device_model || 'Unknown',
      os_version: row.os_version || 'Unknown',
      gps_latitude: row.gps_latitude !== null ? Number(row.gps_latitude) : undefined,
      gps_longitude: row.gps_longitude !== null ? Number(row.gps_longitude) : undefined,
      battery_start: row.battery_start !== null ? Number(row.battery_start) : undefined,
      battery_end: row.battery_end !== null ? Number(row.battery_end) : undefined,
      network_type_upload: row.network_type_upload || undefined,
      extensible_metadata: extMeta,
      upload_state: row.upload_state,
      attempt_count: Number(row.attempt_count),
      last_error: row.last_error,
      last_attempted_at: row.last_attempted_at,
      s3_bucket: row.s3_bucket,
      s3_key: row.s3_key,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || null,
    };
  },
};
