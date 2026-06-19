import uuid
import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base

class Worker(Base):
    """
    Model representing a mobile worker capturing video data.
    """
    __tablename__ = "workers"

    worker_id: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    email_or_phone: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship to videos
    videos: Mapped[List["Video"]] = relationship("Video", back_populates="worker")


class Video(Base):
    """
    Model representing a captured video and its sync state.
    Mirrors the client-side SQLite schema exactly.
    """
    __tablename__ = "videos"

    # Primary and Foreign Keys
    video_id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    worker_id: Mapped[str] = mapped_column(String(50), ForeignKey("workers.worker_id"), nullable=False, index=True)
    
    # Core Capturing Timestamps
    started_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Technical Video Metrics
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    fps: Mapped[float] = mapped_column(Float, nullable=False)
    fps_tier: Mapped[str] = mapped_column(String(20), nullable=False)  # 'low', 'standard', 'high'
    resolution: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g., '1920x1080'
    local_path: Mapped[str] = mapped_column(Text, nullable=False)  # Path on the physical Android device
    
    # Device Context
    device_model: Mapped[str] = mapped_column(String(100), nullable=False)
    os_version: Mapped[str] = mapped_column(String(50), nullable=False)

    # Optional Metadata (Bonus Signals)
    gps_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gps_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    battery_start: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    battery_end: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    network_type_upload: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # 'wifi', 'cellular', 'none'
    
    # Extensible Metadata (Dynamic settings/tags)
    extensible_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # S3 Storage Location
    s3_bucket: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    s3_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Sync and Upload Queue Engine State
    # States: 'pending', 'uploading', 'uploaded', 'failed'
    upload_state: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_attempted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Audit timestamps
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    # Relationship to worker
    worker: Mapped["Worker"] = relationship("Worker", back_populates="videos")
