import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

export type AIChatIdempotencyStatus = 'processing' | 'completed' | 'failed';

export interface AIChatIdempotencyRecord {
  id: string;
  user_id: string;
  conversation_id: string;
  idempotency_key: string;
  request_hash: string;
  status: AIChatIdempotencyStatus;
  user_message_id: string | null;
  assistant_message_id: string | null;
  response_payload: unknown;
  error_code: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AIChatIdempotencyClaim {
  record: AIChatIdempotencyRecord;
  claimed: boolean;
}

@Injectable()
export class AIChatIdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claimRequest(input: {
    userId: string;
    conversationId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<AIChatIdempotencyClaim> {
    const inserted = await this.prisma.$queryRaw<AIChatIdempotencyRecord[]>`
        INSERT INTO "ai_chat_requests" (
          "user_id",
          "conversation_id",
          "idempotency_key",
          "request_hash",
          "status"
        )
        VALUES (
          ${input.userId}::uuid,
          ${input.conversationId}::uuid,
          ${input.idempotencyKey},
          ${input.requestHash},
          'processing'
        )
        ON CONFLICT (
          "user_id",
          "conversation_id",
          "idempotency_key"
        ) DO NOTHING
        RETURNING *
      `;

    if (inserted.length > 0) {
      return { record: inserted[0], claimed: true };
    }

    const existingRows = await this.prisma.$queryRaw<AIChatIdempotencyRecord[]>`
        SELECT *
        FROM "ai_chat_requests"
        WHERE "user_id" = ${input.userId}::uuid
          AND "conversation_id" = ${input.conversationId}::uuid
          AND "idempotency_key" = ${input.idempotencyKey}
        LIMIT 1
      `;

    const existing = existingRows[0];

    if (!existing) {
      throw new Error(
        'Unable to load AI chat idempotency record after conflict',
      );
    }

    // IMPORTANT: never reclaim a request until its payload is verified.
    if (existing.request_hash !== input.requestHash) {
      return { record: existing, claimed: false };
    }

    if (existing.status === 'failed') {
      const reclaimed = await this.prisma.$queryRaw<AIChatIdempotencyRecord[]>`
          UPDATE "ai_chat_requests"
          SET
            "status" = 'processing',
            "error_code" = NULL,
            "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${existing.id}::uuid
            AND "status" = 'failed'
            AND "request_hash" = ${input.requestHash}
          RETURNING *
        `;

      if (reclaimed.length > 0) {
        return { record: reclaimed[0], claimed: true };
      }
    }

    if (existing.status === 'processing') {
      const reclaimed = await this.prisma.$queryRaw<AIChatIdempotencyRecord[]>`
          UPDATE "ai_chat_requests"
          SET "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${existing.id}::uuid
            AND "status" = 'processing'
            AND "request_hash" = ${input.requestHash}
            AND "updated_at" <
              CURRENT_TIMESTAMP - INTERVAL '5 minutes'
          RETURNING *
        `;

      if (reclaimed.length > 0) {
        return { record: reclaimed[0], claimed: true };
      }
    }

    const refreshedRows = await this.prisma.$queryRaw<
      AIChatIdempotencyRecord[]
    >`
        SELECT *
        FROM "ai_chat_requests"
        WHERE "id" = ${existing.id}::uuid
        LIMIT 1
      `;

    return {
      record: refreshedRows[0] ?? existing,
      claimed: false,
    };
  }

  async setUserMessageId(requestId: string, messageId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "ai_chat_requests"
      SET
        "user_message_id" = ${messageId}::uuid,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${requestId}::uuid
        AND "status" = 'processing'
    `;
  }

  async completeRequest(input: {
    requestId: string;
    assistantMessageId: string;
    responsePayload: unknown;
  }): Promise<void> {
    const payload = JSON.stringify(input.responsePayload);

    const updated = await this.prisma.$executeRaw`
      UPDATE "ai_chat_requests"
      SET
        "status" = 'completed',
        "assistant_message_id" = ${input.assistantMessageId}::uuid,
        "response_payload" = ${payload}::jsonb,
        "error_code" = NULL,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.requestId}::uuid
        AND "status" = 'processing'
    `;

    if (updated !== 1) {
      throw new Error(
        'Unable to mark AI chat idempotency request as completed',
      );
    }
  }

  async markFailed(
    requestId: string,
    errorCode = 'AI_CHAT_FAILED',
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "ai_chat_requests"
      SET
        "status" = 'failed',
        "error_code" = ${errorCode},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${requestId}::uuid
        AND "status" = 'processing'
    `;
  }

  async findById(requestId: string): Promise<AIChatIdempotencyRecord | null> {
    const rows = await this.prisma.$queryRaw<AIChatIdempotencyRecord[]>`
        SELECT *
        FROM "ai_chat_requests"
        WHERE "id" = ${requestId}::uuid
        LIMIT 1
      `;

    return rows[0] ?? null;
  }
}
