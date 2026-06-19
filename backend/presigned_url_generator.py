#!/usr/bin/env python3
"""
Locara Labs Technical Assignment - Presigned URL Generator
Satisfies requirement: Q5 (Bonus: Presigned URL Generator)

This script generates a scoped PUT URL for a given video_id and worker_id.
It enforces the prefix: uploads/workers/{worker_id}/{year}/{month}/{day}/{video_id}.mp4
It can be run directly from the CLI or imported as a module in the FastAPI backend.
"""

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Optional
import logging
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

logger = logging.getLogger(__name__)

def create_s3_client(
    aws_access_key_id: Optional[str] = None,
    aws_secret_access_key: Optional[str] = None,
    region_name: Optional[str] = None
):
    """
    Creates a Boto3 S3 client using explicit credentials or falling back to env/IAM roles.
    """
    session_params = {}
    if aws_access_key_id:
        session_params['aws_access_key_id'] = aws_access_key_id
    if aws_secret_access_key:
        session_params['aws_secret_access_key'] = aws_secret_access_key
    if region_name:
        session_params['region_name'] = region_name

    session = boto3.Session(**session_params)
    
    # Configure signature version v4 for enhanced security
    s3_config = Config(signature_version='s3v4')
    return session.client('s3', config=s3_config)

def generate_scoped_upload_url(
    worker_id: str,
    video_id: str,
    bucket_name: str,
    expiration: int = 900,  # default 15 minutes (900 seconds)
    s3_client = None
):
    """
    Generates a presigned PUT URL scoped strictly to a worker's namespace.
    
    Format: uploads/workers/{worker_id}/{yyyy}/{mm}/{dd}/{video_id}.mp4
    """
    if not s3_client:
        s3_client = create_s3_client()

    # Get date partitions for S3 namespace partitioning (Q1 Design)
    now = datetime.utcnow()
    year = now.strftime('%Y')
    month = now.strftime('%m')
    day = now.strftime('%d')
    
    # Construct the S3 key namespace
    s3_key = f"uploads/workers/{worker_id}/{year}/{month}/{day}/{video_id}.mp4"

    try:
        # Generate the presigned URL for PUT operation
        # Enforcing Content-Type binary/octet-stream or video/mp4 as an upload constraint
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': bucket_name,
                'Key': s3_key,
                'ContentType': 'video/mp4'
            },
            ExpiresIn=expiration,
            HttpMethod='PUT'
        )
        
        return {
            "video_id": video_id,
            "worker_id": worker_id,
            "s3_bucket": bucket_name,
            "s3_key": s3_key,
            "upload_url": presigned_url,
            "headers": {"Content-Type": "video/mp4"},
            "expires_in_seconds": expiration
        }

    except ClientError as e:
        logger.error(f"Error generating presigned URL: {e}", exc_info=True)
        raise e

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a scoped S3 presigned PUT URL for a video upload.")
    parser.add_argument("--worker-id", required=True, help="Unique identifier of the authenticated worker")
    parser.add_argument("--video-id", required=True, help="UUID v4 of the video session")
    parser.add_argument("--bucket", default="locara-video-uploads", help="S3 bucket name (default: locara-video-uploads)")
    parser.add_argument("--ttl", type=int, default=900, help="URL expiration time in seconds (default: 900)")
    
    # Optional credentials for manual CLI execution
    parser.add_argument("--access-key", help="AWS Access Key ID")
    parser.add_argument("--secret-key", help="AWS Secret Access Key")
    parser.add_argument("--region", default="us-east-1", help="AWS Region (default: us-east-1)")

    args = parser.parse_args()

    # Read credentials from args or fall back to environment variables
    aws_access = args.access_key or os.environ.get("AWS_ACCESS_KEY_ID")
    aws_secret = args.secret_key or os.environ.get("AWS_SECRET_ACCESS_KEY")
    aws_region = args.region or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")

    # Configure CLI logging
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    try:
        # Create client explicitly if credentials provided
        client = None
        if aws_access or aws_secret:
            client = create_s3_client(
                aws_access_key_id=aws_access,
                aws_secret_access_key=aws_secret,
                region_name=aws_region
            )
        
        result = generate_scoped_upload_url(
            worker_id=args.worker_id,
            video_id=args.video_id,
            bucket_name=args.bucket,
            expiration=args.ttl,
            s3_client=client
        )
        
        # Print JSON response to stdout
        print(json.dumps(result, indent=2))
        sys.exit(0)

    except Exception as ex:
        logger.error(f"Execution failed: {ex}", exc_info=True)
        sys.exit(1)
