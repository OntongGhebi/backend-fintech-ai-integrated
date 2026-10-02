import { Injectable } from '@nestjs/common';
import { AIMessageRole } from '../../../../generated/prisma/enums';
@Injectable()
export class AIConversationContextService {
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly MAX_LIMIT = 100;
  getContext(
    messages: Array<{ role: AIMessageRole; content: string }>,
    limit = AIConversationContextService.DEFAULT_LIMIT,
  ): Array<{ role: AIMessageRole; content: string }> {
    const normalizedLimit = Math.min(
      Math.max(limit, 1),
      AIConversationContextService.MAX_LIMIT,
    );
    if (messages.length <= normalizedLimit) {
      return messages;
    }
    const systemMessages = messages.filter(
      (message) => message.role === AIMessageRole.SYSTEM,
    );
    const nonSystemMessages = messages.filter(
      (message) => message.role !== AIMessageRole.SYSTEM,
    );
    /* * System messages are important because they contain * instructions/context for the AI model. * * However, the final context must never exceed the * requested limit. */ const preservedSystemMessages =
      systemMessages.slice(0, normalizedLimit);
    const availableMessageSlots =
      normalizedLimit - preservedSystemMessages.length;
    if (availableMessageSlots <= 0) {
      return preservedSystemMessages;
    }
    const recentMessages = nonSystemMessages.slice(-availableMessageSlots);
    /* * Reconstruct the context in chronological order. * * System messages originally belong at the beginning * of the conversation context. */ return [
      ...preservedSystemMessages,
      ...recentMessages,
    ];
  }
}
