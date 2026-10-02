import { AIMessageRole } from '../../../../generated/prisma/enums';
import { AIConversationContextService } from './ai-conversation-context.service';
describe('AIConversationContextService', () => {
  let service: AIConversationContextService;
  beforeEach(() => {
    service = new AIConversationContextService();
  });
  describe('getContext', () => {
    it('should return all messages when the conversation is within the default limit', () => {
      const messages = [
        {
          role: AIMessageRole.SYSTEM,
          content: 'You are a financial assistant.',
        },
        { role: AIMessageRole.USER, content: 'Halo' },
        { role: AIMessageRole.ASSISTANT, content: 'Halo juga.' },
      ];
      expect(service.getContext(messages)).toEqual(messages);
    });
    it('should keep the most recent messages when the context exceeds the limit', () => {
      const messages = Array.from({ length: 25 }, (_, index) => ({
        role: index % 2 === 0 ? AIMessageRole.USER : AIMessageRole.ASSISTANT,
        content: `Message ${index + 1}`,
      }));
      const result = service.getContext(messages, 20);
      expect(result).toHaveLength(20);
      expect(result[0]).toEqual({
        role: AIMessageRole.ASSISTANT,
        content: 'Message 6',
      });
      expect(result[19]).toEqual({
        role: AIMessageRole.USER,
        content: 'Message 25',
      });
    });
    it('should preserve system messages while keeping the total context within the limit', () => {
      const messages = [
        {
          role: AIMessageRole.SYSTEM,
          content: 'You are a financial assistant.',
        },
        ...Array.from({ length: 25 }, (_, index) => ({
          role: index % 2 === 0 ? AIMessageRole.USER : AIMessageRole.ASSISTANT,
          content: `Message ${index + 1}`,
        })),
      ];
      const result = service.getContext(messages, 20);
      expect(result).toHaveLength(20);
      expect(result[0]).toEqual({
        role: AIMessageRole.SYSTEM,
        content: 'You are a financial assistant.',
      });
      expect(result[19]).toEqual({
        role: AIMessageRole.USER,
        content: 'Message 25',
      });
    });
    it('should never exceed the maximum context limit', () => {
      const messages = Array.from({ length: 150 }, (_, index) => ({
        role: AIMessageRole.USER,
        content: `Message ${index + 1}`,
      }));
      const result = service.getContext(messages, 1000);
      expect(result).toHaveLength(100);
    });
    it('should normalize a context limit below one to one', () => {
      const messages = [
        { role: AIMessageRole.USER, content: 'Message 1' },
        { role: AIMessageRole.USER, content: 'Message 2' },
      ];
      const result = service.getContext(messages, 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: AIMessageRole.USER,
        content: 'Message 2',
      });
    });
    it('should preserve chronological order of selected messages', () => {
      const messages = [
        { role: AIMessageRole.USER, content: 'Message 1' },
        { role: AIMessageRole.ASSISTANT, content: 'Message 2' },
        { role: AIMessageRole.USER, content: 'Message 3' },
        { role: AIMessageRole.ASSISTANT, content: 'Message 4' },
      ];
      const result = service.getContext(messages, 2);
      expect(result).toEqual([
        { role: AIMessageRole.USER, content: 'Message 3' },
        { role: AIMessageRole.ASSISTANT, content: 'Message 4' },
      ]);
    });
  });
});
