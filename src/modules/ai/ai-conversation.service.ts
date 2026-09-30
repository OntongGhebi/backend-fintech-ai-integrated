import { Injectable, NotFoundException } from '@nestjs/common';
import { AIMessageRole } from 'generated/prisma/enums';
import { AIConversationRepository } from './repositories/ai-conversation.repository';

@Injectable()
export class AIConversationService {
  constructor(
    private readonly aiConversationRepository: AIConversationRepository,
  ) {}

  async createConversation(userId: string, title?: string | null) {
    return this.aiConversationRepository.createConversation(userId, title);
  }

  async findMany(userId: string) {
    return this.aiConversationRepository.findManyConversationsByUserId(userId);
  }

  async findById(userId: string, conversationId: string) {
    const conversation =
      await this.aiConversationRepository.findConversationWithMessagesByIdAndUserId(
        conversationId,
        userId,
      );

    if (!conversation) {
      throw new NotFoundException('AI conversation not found');
    }

    return conversation;
  }

  async addMessage(
    userId: string,
    conversationId: string,
    role: AIMessageRole,
    content: string,
    model?: string | null,
  ) {
    const conversation =
      await this.aiConversationRepository.findConversationByIdAndUserId(
        conversationId,
        userId,
      );

    if (!conversation) {
      throw new NotFoundException('AI conversation not found');
    }

    const normalizedContent = content.trim();

    if (!normalizedContent) {
      throw new Error('AI message content cannot be empty');
    }

    return this.aiConversationRepository.createMessage(
      conversationId,
      role,
      normalizedContent,
      model,
    );
  }

  async updateTitle(
    userId: string,
    conversationId: string,
    title: string | null,
  ) {
    const conversation =
      await this.aiConversationRepository.findConversationByIdAndUserId(
        conversationId,
        userId,
      );

    if (!conversation) {
      throw new NotFoundException('AI conversation not found');
    }

    await this.aiConversationRepository.updateConversationTitle(
      conversationId,
      userId,
      title,
    );

    return this.aiConversationRepository.findConversationByIdAndUserId(
      conversationId,
      userId,
    );
  }

  async remove(userId: string, conversationId: string) {
    const conversation =
      await this.aiConversationRepository.findConversationByIdAndUserId(
        conversationId,
        userId,
      );

    if (!conversation) {
      throw new NotFoundException('AI conversation not found');
    }

    await this.aiConversationRepository.deleteConversation(
      conversationId,
      userId,
    );

    return {
      message: 'AI conversation deleted successfully',
    };
  }
}
