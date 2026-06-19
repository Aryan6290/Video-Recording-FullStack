resource "aws_lambda_function" "s3_event_handler" {
  filename      = "dummy_lambda.zip"
  function_name = "s3-event-handler-webhook-dispatcher-${var.environment}"
  role          = aws_iam_role.lambda_exec_role.arn
  handler       = "index.handler"
  runtime       = "python3.11"

  environment {
    variables = {
      WEBHOOK_URL = var.webhook_url
      API_SECRET  = var.webhook_secret
    }
  }
}

resource "aws_lambda_permission" "allow_s3_notification_trigger" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.s3_event_handler.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.video_uploads.arn
}
