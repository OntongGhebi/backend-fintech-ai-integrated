/*
  Warnings:

  - You are about to drop the `ai_chat_requests` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ai_chat_requests" DROP CONSTRAINT "ai_chat_requests_assistant_message_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_chat_requests" DROP CONSTRAINT "ai_chat_requests_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_chat_requests" DROP CONSTRAINT "ai_chat_requests_user_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_chat_requests" DROP CONSTRAINT "ai_chat_requests_user_message_id_fkey";

-- AlterTable
ALTER TABLE "budget_allocations" ALTER COLUMN "id" DROP DEFAULT;

-- DropTable
DROP TABLE "ai_chat_requests";
