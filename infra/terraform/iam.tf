resource "aws_iam_policy" "presigned_url_generator_policy" {
  name        = "LocaraPresignedUrlGeneratorPolicy-${var.environment}"
  path        = "/"
  description = "Allows backend API to generate PUT presigned URLs for worker directories"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowPutObjectScopedToWorkersDir"
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.video_uploads.arn}/uploads/workers/*"
      }
    ]
  })
}

resource "aws_iam_role" "lambda_exec_role" {
  name = "s3-lambda-webhook-exec-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}
