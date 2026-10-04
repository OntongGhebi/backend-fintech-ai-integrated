import { AIMessageRole } from '../../../../generated/prisma/enums';

import { AIConversationContextService } from './ai-conversation-context.service';

describe('AIConversationContextService', () => {
  let service: AIConversationContextService;

  beforeEach(() => {
    service = new AIConversationContextService();
  });

  describe('getContext', () => {
    it('should return all messages when they are within the limit', () => {
      const messages = [
        {
          role: AIMessageRole.USER,
          content: 'Hello',
        },
        {
          role: AIMessageRole.ASSISTANT,
          content: 'Hi',
        },
      ];

      const result = service.getContext(messages, 20);

      expect(result).toEqual(messages);
      expect(result).not.toBe(messages);
    });

    it('should keep the newest messages when context exceeds the limit', () => {
      const messages = Array.from({ length: 10 }, (_, index) => ({
        role: AIMessageRole.USER,
        content: `message-${index + 1}`,
      }));

      const result = service.getContext(messages, 3);

      expect(result).toEqual([
        {
          role: AIMessageRole.USER,
          content: 'message-8',
        },
        {
          role: AIMessageRole.USER,
          content: 'message-9',
        },
        {
          role: AIMessageRole.USER,
          content: 'message-10',
        },
      ]);
    });

    it('should preserve system messages', () => {
      const messages = [
        {
          role: AIMessageRole.SYSTEM,
          content: 'system instruction',
        },
        {
          role: AIMessageRole.USER,
          content: 'old message',
        },
        {
          role: AIMessageRole.USER,
          content: 'new message',
        },
      ];

      const result = service.getContext(messages, 2);

      expect(result).toEqual([
        {
          role: AIMessageRole.SYSTEM,
          content: 'system instruction',
        },
        {
          role: AIMessageRole.USER,
          content: 'new message',
        },
      ]);
    });

    it('should never exceed the requested limit', () => {
      const messages = [
        ...Array.from({ length: 30 }, (_, index) => ({
          role: AIMessageRole.SYSTEM,
          content: `system-${index + 1}`,
        })),
        ...Array.from({ length: 30 }, (_, index) => ({
          role: AIMessageRole.USER,
          content: `user-${index + 1}`,
        })),
      ];

      const result = service.getContext(messages, 20);

      expect(result).toHaveLength(20);
    });

    it('should preserve system messages when system messages are fewer than the limit', () => {
      const messages = [
        {
          role: AIMessageRole.SYSTEM,
          content: 'system-1',
        },
        {
          role: AIMessageRole.SYSTEM,
          content: 'system-2',
        },
        {
          role: AIMessageRole.USER,
          content: 'user-1',
        },
        {
          role: AIMessageRole.USER,
          content: 'user-2',
        },
        {
          role: AIMessageRole.USER,
          content: 'user-3',
        },
      ];

      const result = service.getContext(messages, 4);

      expect(result).toEqual([
        {
          role: AIMessageRole.SYSTEM,
          content: 'system-1',
        },
        {
          role: AIMessageRole.SYSTEM,
          content: 'system-2',
        },
        {
          role: AIMessageRole.USER,
          content: 'user-2',
        },
        {
          role: AIMessageRole.USER,
          content: 'user-3',
        },
      ]);
    });

    it('should preserve chronological order among selected messages', () => {
      const messages = [
        {
          role: AIMessageRole.SYSTEM,
          content: 'system',
        },
        {
          role: AIMessageRole.USER,
          content: 'user-1',
        },
        {
          role: AIMessageRole.ASSISTANT,
          content: 'assistant-1',
        },
        {
          role: AIMessageRole.USER,
          content: 'user-2',
        },
        {
          role: AIMessageRole.ASSISTANT,
          content: 'assistant-2',
        },
      ];

      const result = service.getContext(messages, 4);

      expect(result).toEqual([
        {
          role: AIMessageRole.SYSTEM,
          content: 'system',
        },
        {
          role: AIMessageRole.ASSISTANT,
          content: 'assistant-1',
        },
        {
          role: AIMessageRole.USER,
          content: 'user-2',
        },
        {
          role: AIMessageRole.ASSISTANT,
          content: 'assistant-2',
        },
      ]);
    });

    it('should handle an empty message list', () => {
      expect(service.getContext([], 20)).toEqual([]);
    });
  });

  describe('limit normalization', () => {
    it('should use the default limit for NaN', () => {
      const messages = Array.from({ length: 25 }, (_, index) => ({
        role: AIMessageRole.USER,
        content: `message-${index}`,
      }));

      const result = service.getContext(messages, Number.NaN);

      expect(result).toHaveLength(20);
    });

    it('should use the default limit for Infinity', () => {
      expect(service.getContext([], Number.POSITIVE_INFINITY)).toEqual([]);
    });

    it('should floor decimal limits', () => {
      const messages = Array.from({ length: 10 }, (_, index) => ({
        role: AIMessageRole.USER,
        content: `message-${index}`,
      }));

      const result = service.getContext(messages, 3.9);

      expect(result).toHaveLength(3);
    });

    it('should clamp the limit to the maximum', () => {
      expect(service.getContext([], 1000)).toEqual([]);

      expect(service.getMaxLimit()).toBe(100);
    });

    it('should clamp a value below one', () => {
      const messages = [
        {
          role: AIMessageRole.USER,
          content: 'message',
        },
      ];

      const result = service.getContext(messages, 0);

      expect(result).toHaveLength(1);
    });
  });

  describe('metadata', () => {
    it('should expose the default limit', () => {
      expect(service.getDefaultLimit()).toBe(20);
    });

    it('should expose the maximum limit', () => {
      expect(service.getMaxLimit()).toBe(100);
    });
  });
});
