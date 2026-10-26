import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { AIMessageRole } from '../../../../generated/prisma/enums';
import {
  AIConversationContextMessage,
  AIConversationContextOptions,
} from '../types/ai-conversation-context.types';

@Injectable()
export class AIConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(userId: string, title?: string | null) {
    return this.prisma.aIConversation.create({
      data: {
        userId,
        title: title?.trim() || null,
      },
    });
  }

  async findConversationByIdAndUserId(conversationId: string, userId: string) {
    return this.prisma.aIConversation.findFirst({
      where: {
        id: conversationId,
        userId,
      },
    });
  }

  async findConversationWithMessagesByIdAndUserId(
    conversationId: string,
    userId: string,
  ) {
    return this.prisma.aIConversation.findFirst({
      where: {
        id: conversationId,
        userId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async findManyConversationsByUserId(userId: string) {
    return this.prisma.aIConversation.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async updateConversationTitle(
    conversationId: string,
    userId: string,
    title: string | null,
  ) {
    return this.prisma.aIConversation.updateMany({
      where: {
        id: conversationId,
        userId,
      },
      data: {
        title: title?.trim() || null,
      },
    });
  }

  /**
   * Creates a regular message and updates the parent conversation
   * timestamp in one database transaction.
   */
  async createMessage(
    conversationId: string,
    role: AIMessageRole,
    content: string,
    model?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.aIMessage.create({
        data: {
          conversationId,
          role,
          content,
          model: model?.trim() || null,
        },
      });

      const conversationUpdate = await tx.aIConversation.updateMany({
        where: {
          id: conversationId,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      if (conversationUpdate.count !== 1) {
        throw new NotFoundException('AI conversation not found');
      }

      return message;
    });
  }

  /**
   * Atomically persists an idempotent user message and stores its ID
   * on the idempotency request.
   *
   * If either operation fails, both operations are rolled back.
   */
  async createIdempotentUserMessage(input: {
    requestId: string;
    conversationId: string;
    content: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.aIMessage.create({
        data: {
          conversationId: input.conversationId,
          role: AIMessageRole.USER,
          content: input.content,
          model: null,
        },
      });

      const conversationUpdate = await tx.aIConversation.updateMany({
        where: {
          id: input.conversationId,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      if (conversationUpdate.count !== 1) {
        throw new NotFoundException('AI conversation not found');
      }

      const requestUpdate = await tx.$executeRaw`
        UPDATE "ai_chat_requests"
        SET
          "user_message_id" = ${message.id}::uuid,
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.requestId}::uuid
          AND "status" = 'processing'
          AND "user_message_id" IS NULL
      `;

      if (requestUpdate !== 1) {
        throw new Error(
          'Unable to link user message to the idempotency request',
        );
      }

      return message;
    });
  }

  async createIdempotentAssistantMessageAndCompleteRequest(input: {
    requestId: string;
    conversationId: string;
    content: string;
    model: string | null;
    provider: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  }) {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.aIMessage.create({
        data: {
          conversationId: input.conversationId,
          role: 'ASSISTANT',
          content: input.content,
          model: input.model,
        },
      });

      const conversationUpdate = await tx.aIConversation.updateMany({
        where: {
          id: input.conversationId,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      if (conversationUpdate.count !== 1) {
        throw new Error(
          'AI conversation could not be updated while saving the assistant response',
        );
      }

      const responsePayload = {
        conversationId: input.conversationId,
        message,
        provider: input.provider,
        model: input.model,
        usage: input.usage,
      };

      const serializedPayload = JSON.stringify(responsePayload);

      const updatedRequestCount = await tx.$executeRaw`
      UPDATE "ai_chat_requests"
      SET
        "assistant_message_id" = ${message.id}::uuid,
        "response_payload" = ${serializedPayload}::jsonb,
        "status" = 'completed',
        "error_code" = NULL,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE
        "id" = ${input.requestId}::uuid
        AND "status" = 'processing'
    `;

      if (updatedRequestCount !== 1) {
        throw new Error(
          'AI idempotency request could not be completed atomically',
        );
      }

      return responsePayload;
    });
  }

  async findMessagesByConversationId(conversationId: string) {
    return this.prisma.aIMessage.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async deleteConversation(conversationId: string, userId: string) {
    return this.prisma.aIConversation.deleteMany({
      where: {
        id: conversationId,
        userId,
      },
    });
  }

  async findContextMessages(
    conversationId: string,
    userId: string,
    options: AIConversationContextOptions = {},
  ): Promise<AIConversationContextMessage[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));

    const messages = await this.prisma.aIMessage.findMany({
      where: {
        conversationId,
        conversation: {
          userId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      select: {
        role: true,
        content: true,
      },
    });

    return messages.reverse().map((message) => ({
      role: message.role as AIConversationContextMessage['role'],
      content: message.content,
    }));
  }
}
