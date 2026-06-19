resource "aws_s3_bucket" "video_uploads" {
  bucket        = var.bucket_name
  force_destroy = false

  tags = {
    Name        = "Locara Video Uploads"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "video_uploads_privacy" {
  bucket = aws_s3_bucket.video_uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "encryption" {
  bucket = aws_s3_bucket.video_uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "lifecycle_policy" {
  bucket = aws_s3_bucket.video_uploads.id

  rule {
    id     = "video-retention-and-tiering-rule"
    status = "Enabled"

    filter {
      prefix = "uploads/workers/"
    }

    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }

    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    expiration {
      days = 90
    }

    abort_incomplete_multipart_upload_after_days = 7
  }
}

resource "aws_s3_bucket_intelligent_tiering_configuration" "tier_config" {
  bucket = aws_s3_bucket.video_uploads.id
  name   = "EntireBucketIntelligentTiering"

  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }
  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.video_uploads.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.s3_event_handler.arn
    events              = ["s3:ObjectCreated:Put"]
    filter_prefix       = "uploads/workers/"
    filter_suffix       = ".mp4"
  }

  depends_on = [aws_lambda_permission.allow_s3_notification_trigger]
}
