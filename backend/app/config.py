import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # App Settings
    PROJECT_NAME: str = "Locara EgoCentric Video Capture Backend"
    API_V1_STR: str = "/api/v1"
    LOG_LEVEL: str = "INFO"
    ALLOWED_ORIGINS: str = "*"
    
    # Security/Auth
    JWT_SECRET: str = "locara-egocentric-video-super-secret-key-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 Hours

    # Database
    # Defaulting to a local SQLite database for easy testing, override in .env with PostgreSQL
    DATABASE_URL: str = "sqlite:///./video_capture.db"

    # AWS S3 Settings
    AWS_ACCESS_KEY_ID: str = "mock-aws-access-key"
    AWS_SECRET_ACCESS_KEY: str = "mock-aws-secret-key"
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = "locara-video-uploads"
    PRESIGNED_URL_TTL_SECONDS: int = 900  # 15 minutes (appropriate for a 50MB video upload)

    # Allow configuration via .env file
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
