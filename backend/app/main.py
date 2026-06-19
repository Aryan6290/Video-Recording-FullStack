import json
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Security
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db, engine, Base
from app.models import Worker, Video
from app import schemas
from presigned_url_generator import generate_scoped_upload_url, create_s3_client

# Configure standard logging
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("backend")

# Initialize database tables on startup
try:
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified/created successfully.")
except Exception as e:
    logger.critical(f"Database table initialization failed: {e}", exc_info=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS origins from settings
allowed_origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security Header parser
API_KEY_HEADER = APIKeyHeader(name="Authorization", auto_error=False)

def get_current_worker(
    token: Optional[str] = Depends(API_KEY_HEADER), 
    db: Session = Depends(get_db)
) -> Worker:
    """
    Authenticate worker using mock token: Bearer mock-token-{worker_id}.
    """
    if not token or not token.startswith("Bearer "):
        logger.warning("Authentication failed: missing or invalid authorization header.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication token format. Use 'Bearer mock-token-worker123'"
        )
    
    token_str = token.replace("Bearer ", "")
    if not token_str.startswith("mock-token-"):
        logger.warning("Authentication failed: invalid token signature.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid security token signatures"
        )
    
    worker_id = token_str.replace("mock-token-", "")
    
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        logger.info(f"Worker {worker_id} not found in database. Auto-registering.")
        worker = Worker(
            worker_id=worker_id,
            email_or_phone=f"{worker_id}@locaralabs.mock",
            password_hash="mocked_password_hash"
        )
        try:
            db.add(worker)
            db.commit()
            db.refresh(worker)
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to auto-register worker {worker_id}: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error during worker registration"
            )
        
    logger.debug(f"Worker {worker_id} authenticated successfully.")
    return worker

# ==========================================
# Endpoints
# ==========================================

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "docs": "/docs"
    }

@app.post(
    f"{settings.API_V1_STR}/auth/login", 
    response_model=schemas.TokenResponse, 
    tags=["Authentication"]
)
def login(login_data: schemas.LoginRequest, db: Session = Depends(get_db)):
    """
    Mock login endpoint generating a mock token.
    """
    worker_id = login_data.email_or_phone.split("@")[0].replace("+", "").strip()
    if not worker_id:
        worker_id = "default_worker"
        
    worker = db.query(Worker).filter(Worker.worker_id == worker_id).first()
    if not worker:
        logger.info(f"Registering new worker {worker_id} on login.")
        worker = Worker(
            worker_id=worker_id,
            email_or_phone=login_data.email_or_phone,
            password_hash="mocked_password_hash"
        )
        try:
            db.add(worker)
            db.commit()
            db.refresh(worker)
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to register worker {worker_id} on login: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error registering worker"
            )

    logger.info(f"Worker {worker.worker_id} logged in successfully.")
    return {
        "access_token": f"mock-token-{worker.worker_id}",
        "token_type": "Bearer",
        "worker_id": worker.worker_id
    }


@app.post(
    f"{settings.API_V1_STR}/videos/metadata",
    response_model=schemas.VideoResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Video Management"]
)
def register_video_metadata(
    video_data: schemas.VideoCreate,
    current_worker: Worker = Depends(get_current_worker),
    db: Session = Depends(get_db)
):
    """
    Register video metadata captured by the client.
    """
    existing_video = db.query(Video).filter(Video.video_id == video_data.video_id).first()
    if existing_video:
        logger.warning(f"Video registration rejected: metadata for {video_data.video_id} already exists.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Video metadata with ID {video_data.video_id} already registered."
        )

    new_video = Video(
        video_id=video_data.video_id,
        worker_id=current_worker.worker_id,
        started_at=video_data.started_at,
        ended_at=video_data.ended_at,
        duration_ms=video_data.duration_ms,
        file_size_bytes=video_data.file_size_bytes,
        fps=video_data.fps,
        fps_tier=video_data.fps_tier,
        resolution=video_data.resolution,
        local_path=video_data.local_path,
        device_model=video_data.device_model,
        os_version=video_data.os_version,
        gps_latitude=video_data.gps_latitude,
        gps_longitude=video_data.gps_longitude,
        battery_start=video_data.battery_start,
        battery_end=video_data.battery_end,
        network_type_upload=video_data.network_type_upload,
        extensible_metadata=video_data.extensible_metadata,
        upload_state="pending",
        attempt_count=0
    )

    try:
        db.add(new_video)
        db.commit()
        db.refresh(new_video)
        logger.info(f"Registered video metadata for {new_video.video_id} (Worker: {current_worker.worker_id})")
        return new_video
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to register video metadata for {video_data.video_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error registering video metadata"
        )


@app.post(
    f"{settings.API_V1_STR}/videos/presigned-url",
    response_model=schemas.PresignedUrlResponse,
    tags=["Sync Engine"]
)
def request_presigned_url(
    payload: schemas.PresignedUrlRequest,
    current_worker: Worker = Depends(get_current_worker),
    db: Session = Depends(get_db)
):
    """
    Generate scoped S3 presigned URL for a specific video.
    """
    video = db.query(Video).filter(Video.video_id == payload.video_id).first()
    
    if not video:
        logger.warning(f"Presigned URL request failed: video metadata for {payload.video_id} not registered.")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video metadata not found. Register metadata before requesting upload URL."
        )
    
    if video.worker_id != current_worker.worker_id:
        logger.warning(f"Forbidden access: worker {current_worker.worker_id} requested URL for video {video.video_id} owned by {video.worker_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Cannot generate upload URLs for videos owned by other workers."
        )

    if video.upload_state == "uploaded":
        logger.warning(f"Presigned URL request rejected: video {video.video_id} already marked as uploaded.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Video has already been successfully uploaded. Upload state cannot be reverted."
        )

    try:
        s3_client = create_s3_client(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION
        )
        
        url_payload = generate_scoped_upload_url(
            worker_id=current_worker.worker_id,
            video_id=video.video_id,
            bucket_name=settings.S3_BUCKET_NAME,
            expiration=settings.PRESIGNED_URL_TTL_SECONDS,
            s3_client=s3_client
        )
        
        video.upload_state = "uploading"
        video.s3_bucket = url_payload["s3_bucket"]
        video.s3_key = url_payload["s3_key"]
        video.attempt_count += 1
        video.last_attempted_at = datetime.utcnow()
        db.commit()

        logger.info(f"Generated upload URL for video {video.video_id} (Worker: {current_worker.worker_id})")
        return {
            "video_id": video.video_id,
            "upload_url": url_payload["upload_url"],
            "s3_bucket": url_payload["s3_bucket"],
            "s3_key": url_payload["s3_key"],
            "headers": url_payload["headers"],
            "ttl_seconds": url_payload["expires_in_seconds"]
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to generate presigned S3 URL for video {video.video_id}: {e}", exc_info=True)
        
        # Safely try to track the error in the database
        try:
            video.upload_state = "failed"
            video.last_error = str(e)
            db.commit()
        except Exception as db_err:
            db.rollback()
            logger.error(f"Failed to save upload failure state to database: {db_err}", exc_info=True)
            
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate S3 Presigned URL: {str(e)}"
        )


@app.post(
    f"{settings.API_V1_STR}/videos/confirm",
    tags=["Sync Engine"]
)
def confirm_upload(
    payload: schemas.UploadConfirmationRequest,
    current_worker: Worker = Depends(get_current_worker),
    db: Session = Depends(get_db)
):
    """
    Update upload state based on client success/failure feedback.
    """
    video = db.query(Video).filter(Video.video_id == payload.video_id).first()
    
    if not video:
        logger.warning(f"Upload confirmation failed: video {payload.video_id} not found.")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video not found."
        )

    if video.worker_id != current_worker.worker_id:
        logger.warning(f"Forbidden upload confirmation: worker {current_worker.worker_id} attempted access on video {video.video_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied."
        )

    if video.upload_state == "uploaded":
        return {"status": "success", "message": "Video is already marked as uploaded."}

    if payload.succeeded:
        video.upload_state = "uploaded"
        video.last_error = None
        logger.info(f"Client confirmed upload success for video {video.video_id}")
    else:
        video.upload_state = "failed"
        video.last_error = payload.error_message or "Client reported upload failure"
        logger.warning(f"Client reported upload failure for video {video.video_id}: {video.last_error}")
        
    try:
        db.commit()
        db.refresh(video)
        return {
            "video_id": video.video_id,
            "upload_state": video.upload_state,
            "attempts": video.attempt_count
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to confirm upload status in database: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error during upload confirmation"
        )


@app.post(
    "/api/webhooks/s3-upload-confirmation",
    tags=["System Webhooks"]
)
def s3_upload_confirmation_webhook(
    event_payload: dict,
    db: Session = Depends(get_db)
):
    """
    Handle S3 Event Notifications webhook to mark video as uploaded.
    """
    logger.info("Received S3 upload confirmation webhook event.")
    try:
        records = event_payload.get("Records", [])
        if not records:
            detail = event_payload.get("detail", {})
            bucket_name = detail.get("bucket", {}).get("name")
            s3_key = detail.get("object", {}).get("key")
        else:
            record = records[0]
            bucket_name = record.get("s3", {}).get("bucket", {}).get("name")
            s3_key = record.get("s3", {}).get("object", {}).get("key")
        
        if not s3_key:
            raise ValueError("S3 key not found in webhook event payload")

        filename = s3_key.split("/")[-1]
        video_id = filename.split(".")[0]

        video = db.query(Video).filter(Video.video_id == video_id).first()
        if not video:
            logger.error(f"Webhook error: Video with ID {video_id} not found in database.")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video associated with key {s3_key} (parsed video ID: {video_id}) not found."
            )

        video.upload_state = "uploaded"
        video.s3_bucket = bucket_name
        video.s3_key = s3_key
        video.last_error = None
        
        try:
            db.commit()
            logger.info(f"Video {video_id} successfully confirmed uploaded via webhook (S3 bucket: {bucket_name}).")
            return {
                "status": "success",
                "message": f"Video {video_id} successfully marked as UPLOADED via S3 webhook confirmation.",
                "video_id": video_id
            }
        except Exception as db_err:
            db.rollback()
            logger.error(f"Failed to save webhook confirmation to database: {db_err}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error updating video state via webhook"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing S3 webhook payload: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process S3 event: {str(e)}"
        )


@app.get(
    f"{settings.API_V1_STR}/videos",
    response_model=List[schemas.VideoResponse],
    tags=["Video Management"]
)
def list_videos(
    limit: int = 20,
    cursor_timestamp: Optional[datetime] = None,
    cursor_id: Optional[str] = None,
    upload_state: Optional[str] = None,
    current_worker: Worker = Depends(get_current_worker),
    db: Session = Depends(get_db)
):
    """
    List paginated videos captured by the worker.
    """
    logger.debug(f"Worker {current_worker.worker_id} requested list_videos with limit={limit}, upload_state={upload_state}")
    query = db.query(Video).filter(Video.worker_id == current_worker.worker_id)
    
    if upload_state:
        query = query.filter(Video.upload_state == upload_state)
        
    if cursor_timestamp:
        if cursor_id:
            query = query.filter(
                (Video.started_at < cursor_timestamp) | 
                ((Video.started_at == cursor_timestamp) & (Video.video_id < cursor_id))
            )
        else:
            query = query.filter(Video.started_at < cursor_timestamp)
            
    query = query.order_by(Video.started_at.desc(), Video.video_id.desc())
    videos = query.limit(limit).all()
    
    return videos
