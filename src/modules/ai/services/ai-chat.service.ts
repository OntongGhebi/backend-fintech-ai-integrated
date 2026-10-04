import { Injectable, NotFoundException } from '@nestjs/common';
import { AIMessageRole } from '../../../../generated/prisma/enums';
import { AIService } from './ai.service';
import { AICompletionResponse, AIMessage } from '../types/ai.types';
import { AIConversationService } from './ai-conversation.service';
import { AIConversationContextService } from './ai-conversation-context.service';
import { AI_USAGE_FEATURES } from '../constants/ai-usage.constants';

export interface AIChatMessageResult {
  id: string;
  role: AIMessageRole;
  content: string;
  model: string | null;
  createdAt: Date;
}

export interface AIChatResult {
  conversationId: string;
  message: AIChatMessageResult;
  provider: string;
  model: string;
  usage: AICompletionResponse['usage'];
}

@Injectable()
export class AIChatService {
  constructor(
    private readonly aiConversationService: AIConversationService,
    private readonly aiService: AIService,
    private readonly aiConversationContextService: AIConversationContextService,
  ) {}

  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<AIChatResult> {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      throw new Error('AI message content cannot be empty');
    }

    const conversation = await this.aiConversationService.findById(
      userId,
      conversationId,
    );

    if (!conversation) {
      throw new NotFoundException('AI conversation not found');
    }

    await this.aiConversationService.addMessage(
      userId,
      conversationId,
      AIMessageRole.USER,
      normalizedContent,
    );

    const updatedConversation = await this.aiConversationService.findById(
      userId,
      conversationId,
    );

    if (!updatedConversation) {
      throw new NotFoundException('AI conversation not found');
    }

    const contextMessages = this.aiConversationContextService.getContext(
      updatedConversation.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    );

    const messages = this.buildAIMessageHistory(contextMessages);

    const completion = await this.aiService.complete(
      {
        messages,
        temperature: 0.2,
      },
      {
        userId,
        feature: AI_USAGE_FEATURES.CHAT,
      },
    );

    const assistantMessage = await this.aiConversationService.addMessage(
      userId,
      conversationId,
      AIMessageRole.ASSISTANT,
      completion.content,
      completion.model,
    );

    return {
      conversationId,
      message: assistantMessage,
      provider: completion.provider,
      model: completion.model,
      usage: completion.usage,
    };
  }

  private buildAIMessageHistory(
    messages: Array<{
      role: AIMessageRole;
      content: string;
    }>,
  ): AIMessage[] {
    return messages
      .filter(
        (message) =>
          message.role === AIMessageRole.SYSTEM ||
          message.role === AIMessageRole.USER ||
          message.role === AIMessageRole.ASSISTANT,
      )
      .map((message) => ({
        role: this.mapMessageRole(message.role),
        content: message.content,
      }));
  }

  private mapMessageRole(role: AIMessageRole): AIMessage['role'] {
    switch (role) {
      case AIMessageRole.SYSTEM:
        return 'system';

      case AIMessageRole.USER:
        return 'user';

      case AIMessageRole.ASSISTANT:
        return 'assistant';

      default:
        throw new Error(`Unknown AI message role: ${role}`);
    }
  }
}
