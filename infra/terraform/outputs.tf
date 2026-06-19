output "s3_bucket_arn" {
  value       = aws_s3_bucket.video_uploads.arn
  description = "ARN of the video uploads bucket"
}

output "presigned_url_policy_arn" {
  value       = aws_iam_policy.presigned_url_generator_policy.arn
  description = "ARN of the IAM policy for the URL generator backend"
}
