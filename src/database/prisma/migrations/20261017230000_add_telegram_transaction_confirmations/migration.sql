
CREATE TYPE "TelegramTransactionConfirmationStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED'
);

CREATE TABLE "telegram_transaction_confirmations" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "telegramAccountId" UUID NOT NULL,
  "chatId" VARCHAR(100) NOT NULL,
  "sourceMessageId" VARCHAR(100) NOT NULL,
  "telegramUserId" BIGINT NOT NULL,
  "intent" JSONB NOT NULL,
  "status" "TelegramTransactionConfirmationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "telegram_transaction_confirmations_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "telegram_transaction_confirmations_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "users"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT "telegram_transaction_confirmations_telegramAccountId_fkey"
    FOREIGN KEY ("telegramAccountId")
    REFERENCES "telegram_accounts"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "telegram_transaction_confirmations_chatId_sourceMessageId_key"
  ON "telegram_transaction_confirmations"("chatId", "sourceMessageId");

CREATE INDEX "telegram_transaction_confirmations_userId_status_createdAt_idx"
  ON "telegram_transaction_confirmations"("userId", "status", "createdAt");

CREATE INDEX "telegram_transaction_confirmations_chatId_status_createdAt_idx"
  ON "telegram_transaction_confirmations"("chatId", "status", "createdAt");

CREATE INDEX "telegram_transaction_confirmations_status_expiresAt_idx"
  ON "telegram_transaction_confirmations"("status", "expiresAt");

ALTER TABLE "transactions"
  ADD COLUMN "telegramConfirmationId" UUID;

CREATE UNIQUE INDEX "transactions_telegramConfirmationId_key"
  ON "transactions"("telegramConfirmationId");

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_telegramConfirmationId_fkey"
  FOREIGN KEY ("telegramConfirmationId")
  REFERENCES "telegram_transaction_confirmations"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
