
-- Persist idempotency state for AI chat requests.
-- The unique constraint is the concurrency boundary.
CREATE TABLE "ai_chat_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'processing',
    "user_message_id" UUID,
    "assistant_message_id" UUID,
    "response_payload" JSONB,
    "error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_requests_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "ai_chat_requests_status_check"
        CHECK ("status" IN ('processing', 'completed', 'failed')),

    CONSTRAINT "ai_chat_requests_user_id_fkey"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "ai_chat_requests_conversation_id_fkey"
        FOREIGN KEY ("conversation_id")
        REFERENCES "ai_conversations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "ai_chat_requests_user_message_id_fkey"
        FOREIGN KEY ("user_message_id")
        REFERENCES "ai_messages"("id")
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "ai_chat_requests_assistant_message_id_fkey"
        FOREIGN KEY ("assistant_message_id")
        REFERENCES "ai_messages"("id")
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "ai_chat_requests_user_conversation_key_unique"
        UNIQUE ("user_id", "conversation_id", "idempotency_key")
);

CREATE INDEX "ai_chat_requests_status_updated_at_idx"
    ON "ai_chat_requests" ("status", "updated_at");

CREATE INDEX "ai_chat_requests_conversation_created_at_idx"
    ON "ai_chat_requests" ("conversation_id", "created_at" DESC);
