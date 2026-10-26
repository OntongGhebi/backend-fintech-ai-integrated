import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { AIMessageRole } from 'generated/prisma/enums';
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
   * Creates a message and updates its parent conversation timestamp
   * atomically.
   *
   * This keeps the conversation list ordered by recent activity and avoids
   * persisting a message if the parent conversation cannot be updated.
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
