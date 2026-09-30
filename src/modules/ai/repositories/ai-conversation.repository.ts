import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { AIMessageRole } from 'generated/prisma/enums';

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

  async createMessage(
    conversationId: string,
    role: AIMessageRole,
    content: string,
    model?: string | null,
  ) {
    return this.prisma.aIMessage.create({
      data: {
        conversationId,
        role,
        content,
        model: model?.trim() || null,
      },
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
}
