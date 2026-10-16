/*
  Warnings:

  - A unique constraint covering the columns `[recurringExecutionKey]` on the table `transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "recurringExecutionKey" VARCHAR(255),
ADD COLUMN     "recurringTransactionId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_recurringExecutionKey_key" ON "transactions"("recurringExecutionKey");

-- CreateIndex
CREATE INDEX "transactions_userId_recurringTransactionId_transactionDate_idx" ON "transactions"("userId", "recurringTransactionId", "transactionDate");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurringTransactionId_fkey" FOREIGN KEY ("recurringTransactionId") REFERENCES "recurring_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
