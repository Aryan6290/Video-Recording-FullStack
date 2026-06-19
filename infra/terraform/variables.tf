variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS deployment region"
}

variable "environment" {
  type        = string
  default     = "production"
  description = "Application deployment tier (production/staging/dev)"
}

variable "bucket_name" {
  type        = string
  default     = "locara-video-uploads"
  description = "Primary bucket name for video assets"
}

variable "webhook_url" {
  type        = string
  default     = "https://api.locaralabs.com/api/webhooks/s3-upload-confirmation"
  description = "Backend webhook endpoint for S3 upload confirmations"
}

variable "webhook_secret" {
  type        = string
  default     = "webhook-signature-secret-key-goes-here"
  description = "Secret key used to sign webhook payloads"
  sensitive   = true
}
