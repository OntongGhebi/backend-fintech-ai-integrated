import { Injectable } from '@nestjs/common';

import { AIMessageRole } from '../../../../generated/prisma/enums';

export interface AIConversationContextMessage {
  role: AIMessageRole;
  content: string;
}

@Injectable()
export class AIConversationContextService {
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly MAX_LIMIT = 100;

  getContext(
    messages: AIConversationContextMessage[],
    limit = AIConversationContextService.DEFAULT_LIMIT,
  ): AIConversationContextMessage[] {
    const normalizedLimit = this.normalizeLimit(limit);

    if (messages.length <= normalizedLimit) {
      return [...messages];
    }

    const systemMessages = messages.filter(
      (message) => message.role === AIMessageRole.SYSTEM,
    );

    const nonSystemMessages = messages.filter(
      (message) => message.role !== AIMessageRole.SYSTEM,
    );

    /*
     * System messages have priority, but they must
     * never cause the resulting context to exceed
     * the requested limit.
     */
    const selectedSystemMessages = systemMessages.slice(0, normalizedLimit);

    const availableMessageSlots = Math.max(
      normalizedLimit - selectedSystemMessages.length,
      0,
    );

    const recentMessages =
      availableMessageSlots > 0
        ? nonSystemMessages.slice(-availableMessageSlots)
        : [];

    return [...selectedSystemMessages, ...recentMessages];
  }

  getDefaultLimit(): number {
    return AIConversationContextService.DEFAULT_LIMIT;
  }

  getMaxLimit(): number {
    return AIConversationContextService.MAX_LIMIT;
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit)) {
      return AIConversationContextService.DEFAULT_LIMIT;
    }

    return Math.min(
      Math.max(Math.floor(limit), 1),
      AIConversationContextService.MAX_LIMIT,
    );
  }
}
