-- CreateIndex
CREATE INDEX "telegram_messages_processingStatus_processingStartedAt_idx" ON "telegram_messages"("processingStatus", "processingStartedAt");
