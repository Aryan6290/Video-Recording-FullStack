# Locara Labs: Egocentric Video Capture System
## Technical Design Document (System Architecture, DB & AWS Infrastructure)

This document details the production-ready system architecture, database schemas, and AWS cloud topology designed for the **EgoCentric Video Capture System** based on the Locara Labs Full Stack Engineering Technical Assignment.

---

## 1. System Architecture

The following diagram illustrates the complete end-to-end architecture, showing the decoupled relationship between the client application (React Native), the Backend API (FastAPI), the local relational cache, and the AWS ingestion pipeline.

```mermaid
graph TD
    subgraph Client Application (React Native Android)
        A[Camera Module] -->|Record Video File| B[Local Android File System]
        A -->|Extract Session Metadata| C[Local SQLite Layer]
        C -->|Queue Engine| D[Upload worker]
    end

    subgraph Authentication
        H[Worker Login] <-->|JWT Handshake| F[FastAPI Backend]
    end

    subgraph Ingestion & Sync Pipeline
        D -->|1. Register Session Metadata| F
        F -->|2. Query Metadata Cache| G[(Backend DB - Postgres)]
        D -->|3. Request Upload URL| F
        F -->|4. Generate Scoped URL| I[S3 Presigned URL Generator]
        D -->|5. HTTP PUT Video File| J[AWS S3 Bucket]
    end

    subgraph Verification & Confirmation
        J -->|6. s3:ObjectCreated Event| K[AWS Lambda Hook]
        K -->|7. Event Webhook API Callback| F
        F -->|8. Mark Uploaded & Close Session| G
        D -->|9. Poll Status / Delete File| F
    end

    style J fill:#f96,stroke:#333,stroke-width:2px
    style C fill:#9cf,stroke:#333,stroke-width:2px
    style F fill:#bbf,stroke:#333,stroke-width:2px
```

### Decoupled Data Flow Pipeline
1. **Capture**: The worker records a video. The video file (MP4) is written to the local device storage (`local_path`).
2. **Metadata Persist**: The session metadata (durations, battery, GPS, resolution, etc.) is written immediately to the local **SQLite database** in a `PENDING` state.
3. **Queue Ingestion**: The local upload queue is triggered. It performs an API handshake with the **FastAPI Backend** to register the metadata record.
4. **Presigned URL Request**: The client requests a scoped presigned upload URL from the `/api/v1/videos/presigned-url` endpoint.
5. **Direct Upload**: The client performs a raw binary HTTP PUT request directly to S3 using the presigned URL, avoiding backend bottlenecks.
6. **Asynchronous Confirmation**: S3 triggers an event notification on success. The notification calls a Lambda function which posts to our backend webhook, transitioning the status to `UPLOADED` and allowing the mobile client to safely delete the local file.

---

## 2. Database Design & Query Optimization (Local SQLite)

The local SQLite schema is optimized for durability, offline reliability, and fast retrieval during app rendering.

### SQLite Schema DDL
```sql
CREATE TABLE IF NOT EXISTS videos (
    video_id TEXT PRIMARY KEY NOT NULL, -- UUID v4 generated on start
    worker_id TEXT NOT NULL,           -- Foreign key matching auth session
    started_at TEXT NOT NULL,          -- ISO 8601 string (UTC)
    ended_at TEXT NOT NULL,            -- ISO 8601 string (UTC)
    duration_ms INTEGER NOT NULL,      -- Millisecond duration
    file_size_bytes INTEGER NOT NULL,  -- Bytes size
    fps REAL NOT NULL,                 -- Frame rate
    fps_tier TEXT CHECK(fps_tier IN ('low', 'standard', 'high')) NOT NULL,
    resolution TEXT NOT NULL,          -- Resolution e.g. '1920x1080'
    local_path TEXT NOT NULL,          -- Android absolute file path
    
    -- Optional Metadata (Bonus Signals)
    gps_latitude REAL,
    gps_longitude REAL,
    battery_start REAL,
    battery_end REAL,
    network_type_upload TEXT CHECK(network_type_upload IN ('wifi', 'cellular', 'none')),
    
    -- Extensible metadata stored as JSON text block
    extensible_metadata TEXT,

    -- Sync Queue tracking columns
    upload_state TEXT CHECK(upload_state IN ('pending', 'uploading', 'uploaded', 'failed')) DEFAULT 'pending' NOT NULL,
    attempt_count INTEGER DEFAULT 0 NOT NULL,
    last_error TEXT,
    last_attempted_at TEXT
);

-- Index Definitions
CREATE INDEX IF NOT EXISTS idx_videos_upload_queue 
ON videos(upload_state, last_attempted_at) 
WHERE upload_state IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_videos_worker_history 
ON videos(worker_id, started_at DESC, video_id DESC);
```

### Database Index Justifications
1. **`idx_videos_upload_queue` (Filtered Index)**:
   * **Why**: The upload queue runs on background loop/network changes, searching for videos to upload (`pending` or `failed`).
   * **Performance impact**: By filtering `WHERE upload_state IN ('pending', 'failed')`, SQLite maintains a micro-index containing only items needing attention. It prevents table scans over thousands of completed (`uploaded`) entries.
2. **`idx_videos_worker_history` (Composite Index)**:
   * **Why**: The Video Management Dashboard queries historical videos for a specific worker sorted by date.
   * **Performance impact**: Combines `worker_id` (equality) with `started_at` (range order) and `video_id` (tiebreaker). It satisfies the dashboard query directly from index pages ($O(\log N)$) without executing a costly external sort ($O(N \log N)$).

### Schema Migration Strategy
**Scenario**: Adding a `gps_accuracy` (REAL) column to an existing database containing 50K rows in production.
Since SQLite lacks support for complex `ALTER TABLE` operations in legacy mobile environments, a structured transactional schema migration pattern is required:

```sql
-- 1. Wrap the entire migration in an ACID Transaction
BEGIN TRANSACTION;

-- 2. Create the target table structure with the new column
CREATE TABLE videos_migration_temp (
    video_id TEXT PRIMARY KEY NOT NULL,
    worker_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    fps REAL NOT NULL,
    fps_tier TEXT NOT NULL,
    resolution TEXT NOT NULL,
    local_path TEXT NOT NULL,
    gps_latitude REAL,
    gps_longitude REAL,
    battery_start REAL,
    battery_end REAL,
    network_type_upload TEXT,
    extensible_metadata TEXT,
    upload_state TEXT DEFAULT 'pending' NOT NULL,
    attempt_count INTEGER DEFAULT 0 NOT NULL,
    last_error TEXT,
    last_attempted_at TEXT,
    gps_accuracy REAL -- New column added here
);

-- 3. Copy existing records to the temporary table (Mapping null value to new column)
INSERT INTO videos_migration_temp (
    video_id, worker_id, started_at, ended_at, duration_ms, file_size_bytes, 
    fps, fps_tier, resolution, local_path, gps_latitude, gps_longitude, 
    battery_start, battery_end, network_type_upload, extensible_metadata, 
    upload_state, attempt_count, last_error, last_attempted_at, gps_accuracy
)
SELECT 
    video_id, worker_id, started_at, ended_at, duration_ms, file_size_bytes, 
    fps, fps_tier, resolution, local_path, gps_latitude, gps_longitude, 
    battery_start, battery_end, network_type_upload, extensible_metadata, 
    upload_state, attempt_count, last_error, last_attempted_at, NULL
FROM videos;

-- 4. Drop the old table
DROP TABLE videos;

-- 5. Rename the temp table to the production table name
ALTER TABLE videos_migration_temp RENAME TO videos;

-- 6. Re-create all indexes
CREATE INDEX idx_videos_upload_queue ON videos(upload_state, last_attempted_at) WHERE upload_state IN ('pending', 'failed');
CREATE INDEX idx_videos_worker_history ON videos(worker_id, started_at DESC, video_id DESC);

-- 7. Record migration success in a schema versions table & commit
COMMIT;
```

### Query Efficiency & Pagination (Cursor vs. Offset)
When displaying the video history dashboard on the client side, using `LIMIT 20 OFFSET 10000` is an anti-pattern. Offset queries force the database to read and discard all prior rows, leading to $O(N)$ query times which cause lags as the history grows.

To prevent this, the dashboard utilizes **Keyset Pagination (Cursor-based)**:
```sql
SELECT * FROM videos
WHERE worker_id = :worker_id
  AND (started_at < :cursor_timestamp OR (started_at = :cursor_timestamp AND video_id < :cursor_id))
ORDER BY started_at DESC, video_id DESC
LIMIT 20;
```
* **Why it is optimized**: The query utilizes the composite index `(worker_id, started_at, video_id)`. Instead of counting and discarding records, SQLite jumps directly to the cursor record using a binary search ($O(\log N)$), ensuring consistent query speeds even with millions of rows.

---

## 3. AWS Infrastructure Design (25% Evaluation Weight)

### Q1: S3 Bucket Design & Prefixing
* **Key Namespace Schema**:
  ```
  uploads/workers/{worker_id}/{yyyy}/{mm}/{dd}/{video_id}.mp4
  ```
* **Justification**:
  1. **Throttling & Partitioning**: AWS S3 scales performance automatically based on prefixes. It supports up to 3,500 PUT requests and 5,500 GET requests per second per prefix. By partitioning on the high-entropy `{worker_id}` immediately following the prefix (`uploads/workers/`), we distribute traffic across 10,000 unique partitions. Even if thousands of workers upload at the same millisecond, S3 will not throttle.
  2. **Security Isolation**: Using the worker ID as a directory prefix allows backend-level path validation and S3 IAM scoping policies.
  3. **Analytical Cleanliness**: Year, month, and day partitioning enables easy integration with analytical tools (like AWS Glue and Amazon Athena) to query video metadata files by date partitions.
* **Single vs. Multiple Buckets**:
  We will use a **single S3 bucket**. Managing multiple buckets (e.g. per-worker buckets) violates AWS limits (default 100 buckets/account, soft limit 1000) and introduces severe operational overhead. Access isolation is easily enforced through prefix policies and presigned URLs within a single bucket.

### Q2: IAM & Security
* **Least Privilege IAM Policy (URL Generator Backend)**:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowPutObjectScopedToWorkersDir",
        "Effect": "Allow",
        "Action": [
          "s3:PutObject"
        ],
        "Resource": "arn:aws:s3:::locara-video-uploads/uploads/workers/*"
      }
    ]
  }
  ```
* **URL Scoping (Preventing Worker A from overwriting Worker B)**:
  Overwriting is prevented by centralizing the key construction on the backend:
  1. The mobile client does not dictate the S3 target path.
  2. The client calls `/api/v1/videos/presigned-url` using its JWT credentials.
  3. The backend validates the JWT session, extracts the authorized `worker_id`, and programmatically compiles the S3 key containing that specific ID.
  4. The generated presigned URL is mathematically signed by the backend’s IAM credentials for that specific key. If Worker A attempts to upload to Worker B’s key using a URL generated for their own key, S3 rejects it with a signature mismatch (`403 Forbidden`).
* **Appropriate URL TTL**:
  We specify a TTL of **15 minutes (900 seconds)**. A 60-second video averages 50MB. Over a cellular connection (average 10 Mbps), the upload completes in 40 seconds. A 15-minute TTL provides a safety margin for network retries and connections while keeping the URL exposure window small.

### Q3: Storage Cost Strategy
* **Basic Parameters**:
  * 10,000 workers × 20 videos/day = 200,000 videos/day.
  * 200,000 videos × 50 MB = 10,000,000 MB = 10 TB of daily uploads.
  * Ingestion rate: 10 TB / day.
  * Accumulated data after 90 days: **900 TB**.
  * PUT requests: 6,000,000 PUT operations / month.

* **Run-Rate Cost at Day 90 (S3 Standard in us-east-1)**:
  * Storage price: \$0.023 per GB/month.
  * Monthly storage cost: $900,000\text{ GB} \times \$0.023 = \mathbf{\$20,700 / \text{month}}$.
  * PUT requests cost: $6,000,000 \times (\$0.005 / 1000) = \mathbf{\$30 / \text{month}}$.

* **Lifecycle Strategy**:
  Keeping 900 TB in S3 Standard is highly inefficient. We implement a custom lifecycle policy:
  1. **Intelligent-Tiering**: Transition objects to S3 Intelligent-Tiering immediately on upload. S3 will automatically monitor access patterns and transition objects to the Infrequent Access (IA) tier after 30 days of no access (saves 40% on storage).
  2. **Glacier Transition Rule**: Transition objects to Glacier Flexible Archive after **30 days**. This drops the storage cost from \$0.023/GB to \$0.0036/GB.
  3. **Expiration Rule**: Automatically expire (delete) objects after **90 days** to cap total storage volume.
  
  **Cost Optimization Breakdown (with 30-day Glacier transition)**:
  * Average active storage layout: 300 TB in Standard, 600 TB in Glacier.
  * Standard tier cost: $300,000\text{ GB} \times \$0.023 = \$6,900 / \text{month}$.
  * Glacier tier cost: $600,000\text{ GB} \times \$0.0036 = \$2,160 / \text{month}$.
  * Optimized monthly stabilized run-rate: **\$9,060 / month** (representing **56% monthly savings**).

### Q4: Upload Confirmation & State Reliability
To enforce the requirement *"A video that reaches UPLOADED must never revert to PENDING"*, we implement an **event-driven upload confirmation pipeline** rather than relying on client-side API calls.

* **The Problem with Client-Side Confirmation**: If a mobile app finishes uploading to S3 but crashes or loses power before sending the `/confirm` call to the backend, the backend database remains permanently in `uploading`/`pending` status. If the client restarts and retries, it might duplicate the upload.
* **The Solution (Event-Driven Hook)**:
  1. Client puts the file to S3.
  2. The moment S3 finishes receiving the file, S3 fires an internal `s3:ObjectCreated:Put` event.
  3. This event triggers an **AWS Lambda function** (pre-authorized).
  4. The Lambda extracts the `video_id` from the S3 key name and invokes our backend webhook endpoint (`/api/webhooks/s3-upload-confirmation`).
  5. The backend marks the database entry as `UPLOADED`.
  6. The client app simply polls the backend status or checks it on startup. If status is `UPLOADED`, the client app safely deletes its local file.

---

## 4. Scalability: What Breaks First at 10K Users?

At 10,000 active workers uploading 20 videos per day, the system processes **2.3 uploads per second** on average, peaking during shift changes (e.g., up to 200 uploads/sec).

### Bottlenecks and Mitigations
1. **Relational Database Locks (Postgres Connection Limit)**:
   * *Problem*: If 10K clients write metadata concurrently to a single database instance, SQL connections will saturate.
   * *Mitigation*: Introduce **Amazon RDS Proxy** to pool database connections. Configure write-heavy transactions to execute via a message queue (like AWS SQS) to buffer database writes.
2. **FastAPI Webhook Bottleneck**:
   * *Problem*: The backend webhook `/api/webhooks/s3-upload-confirmation` receives events sequentially. If database locking delays transactions, the webhook response lags, building up Lambda invocation queues.
   * *Mitigation*: Replace direct Lambda-to-FastAPI webhooks with an **Amazon SQS Queue**. Let the S3 event place a message in SQS, and run background worker processes (using Celery/arq) to consume and update database rows asynchronously.
3. **Local Database Contention**:
   * *Problem*: SQLite locks the entire database file during writes (`SQLITE_BUSY` error). If the upload queue worker writes updates while the camera module is saving a video, the camera write might block or fail.
   * *Mitigation*: Enable **Write-Ahead Logging (WAL)** mode in SQLite:
     ```sql
     PRAGMA journal_mode = WAL;
     PRAGMA synchronous = NORMAL;
     ```
     This allows concurrent read operations while writes are active, preventing UI freezes during uploads.
