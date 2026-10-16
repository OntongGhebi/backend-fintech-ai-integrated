-- CreateIndex
CREATE INDEX "tx_user_status_currency_date_idx" ON "transactions"("userId", "status", "currency", "deletedAt", "transactionDate" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "tx_user_type_status_currency_date_idx" ON "transactions"("userId", "type", "status", "currency", "deletedAt", "transactionDate" DESC, "createdAt" DESC, "id" DESC);
