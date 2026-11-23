ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "notifications"
  ADD COLUMN "idempotencyKey" VARCHAR(255),
  ADD COLUMN "data" JSONB,
  ADD COLUMN "actionUrl" VARCHAR(500),
  ADD COLUMN "processingStartedAt" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "notifications_userId_channel_idempotencyKey_key"
  ON "notifications" ("userId", "channel", "idempotencyKey");

CREATE INDEX "notifications_channel_status_processingStartedAt_idx"
  ON "notifications" ("channel", "status", "processingStartedAt");