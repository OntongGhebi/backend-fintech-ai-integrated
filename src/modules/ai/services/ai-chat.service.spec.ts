import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { expect } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AIMessageRole } from '../../../../generated/prisma/enums';
import { AIService } from './ai.service';
import { AIChatService } from './ai-chat.service';
import { AIConversationService } from './ai-conversation.service';
import { AIConversationContextService } from './ai-conversation-context.service';
import { AI_USAGE_FEATURES } from '../constants/ai-usage.constants';

describe('AIChatService', () => {
  let service: AIChatService;
  const aiConversationServiceMock = {
    findById: jest.fn(),
    addMessage: jest.fn(),
  };
  const aiServiceMock = { complete: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIChatService,
        { provide: AIConversationService, useValue: aiConversationServiceMock },
        { provide: AIService, useValue: aiServiceMock },
        AIConversationContextService,
      ],
    }).compile();
    service = module.get<AIChatService>(AIChatService);
  });
  describe('sendMessage', () => {
    it('should persist user message, build context, send it to AI, and persist assistant response', async () => {
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: 'Test conversation',
        messages: [],
      };
      const userMessage = {
        id: 'message-1',
        role: AIMessageRole.USER,
        content: 'Halo AI',
        model: null,
        createdAt: new Date('2026-09-30T10:00:00.000Z'),
      };
      const assistantMessage = {
        id: 'message-2',
        role: AIMessageRole.ASSISTANT,
        content: 'Halo! Ada yang bisa saya bantu?',
        model: 'test-model',
        createdAt: new Date('2026-09-30T10:00:01.000Z'),
      };
      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [...conversation.messages, userMessage],
        });
      aiConversationServiceMock.addMessage
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(assistantMessage);
      aiServiceMock.complete.mockResolvedValue({
        content: 'Halo! Ada yang bisa saya bantu?',
        provider: 'openai-compatible',
        model: 'test-model',
        usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
      });
      await expect(
        service.sendMessage('user-id', 'conversation-id', ' Halo AI '),
      ).resolves.toEqual({
        conversationId: 'conversation-id',
        message: assistantMessage,
        provider: 'openai-compatible',
        model: 'test-model',
        usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
      });
      expect(aiConversationServiceMock.findById).toHaveBeenNthCalledWith(
        1,
        'user-id',
        'conversation-id',
      );
      expect(aiConversationServiceMock.addMessage).toHaveBeenNthCalledWith(
        1,
        'user-id',
        'conversation-id',
        AIMessageRole.USER,
        'Halo AI',
      );
      expect(aiConversationServiceMock.findById).toHaveBeenNthCalledWith(
        2,
        'user-id',
        'conversation-id',
      );
      expect(aiServiceMock.complete).toHaveBeenCalledWith(
        {
          messages: [{ role: 'user', content: 'Halo AI' }],
          temperature: 0.2,
        },
        {
          userId: 'user-id',
          feature: AI_USAGE_FEATURES.CHAT,
        },
      );
      expect(aiConversationServiceMock.addMessage).toHaveBeenNthCalledWith(
        2,
        'user-id',
        'conversation-id',
        AIMessageRole.ASSISTANT,
        'Halo! Ada yang bisa saya bantu?',
        'test-model',
      );
    });
    it('should reject when the conversation does not exist', async () => {
      aiConversationServiceMock.findById.mockRejectedValue(
        new NotFoundException('AI conversation not found'),
      );
      await expect(
        service.sendMessage('user-id', 'conversation-id', 'Hello'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(aiConversationServiceMock.addMessage).not.toHaveBeenCalled();
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });
    it('should reject an empty message', async () => {
      await expect(
        service.sendMessage('user-id', 'conversation-id', ' '),
      ).rejects.toThrow('AI message content cannot be empty');
      expect(aiConversationServiceMock.findById).not.toHaveBeenCalled();
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });
    it('should not call the AI provider when persisting the user message fails', async () => {
      aiConversationServiceMock.findById.mockResolvedValue({
        id: 'conversation-id',
        userId: 'user-id',
        title: null,
        messages: [],
      });
      aiConversationServiceMock.addMessage.mockRejectedValue(
        new Error('Database error'),
      );
      await expect(
        service.sendMessage('user-id', 'conversation-id', 'Hello'),
      ).rejects.toThrow('Database error');
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });
    it('should propagate AI provider errors and not persist an assistant message', async () => {
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: null,
        messages: [],
      };
      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [
            {
              id: 'message-1',
              role: AIMessageRole.USER,
              content: 'Hello',
              model: null,
              createdAt: new Date(),
            },
          ],
        });
      aiConversationServiceMock.addMessage.mockResolvedValue({
        id: 'message-1',
        role: AIMessageRole.USER,
        content: 'Hello',
        model: null,
        createdAt: new Date(),
      });
      aiServiceMock.complete.mockRejectedValue(
        new ServiceUnavailableException('AI provider request failed'),
      );
      await expect(
        service.sendMessage('user-id', 'conversation-id', 'Hello'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(aiConversationServiceMock.addMessage).toHaveBeenCalledTimes(1);
    });
    it('should preserve system and assistant history', async () => {
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: null,
        messages: [
          {
            id: 'message-1',
            role: AIMessageRole.SYSTEM,
            content: 'You are a financial assistant.',
            model: null,
            createdAt: new Date('2026-09-30T10:00:00.000Z'),
          },
          {
            id: 'message-2',
            role: AIMessageRole.USER,
            content: 'Berapa saldo saya?',
            model: null,
            createdAt: new Date('2026-09-30T10:01:00.000Z'),
          },
          {
            id: 'message-3',
            role: AIMessageRole.ASSISTANT,
            content: 'Saya membutuhkan akses data saldo Anda.',
            model: 'test-model',
            createdAt: new Date('2026-09-30T10:01:01.000Z'),
          },
        ],
      };
      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce(conversation);
      aiConversationServiceMock.addMessage.mockResolvedValue({
        id: 'message-4',
        role: AIMessageRole.USER,
        content: 'Lanjutkan',
        model: null,
        createdAt: new Date(),
      });
      aiServiceMock.complete.mockResolvedValue({
        content: 'Baik.',
        provider: 'openai-compatible',
        model: 'test-model',
      });
      await service.sendMessage('user-id', 'conversation-id', 'Lanjutkan');
      expect(aiServiceMock.complete).toHaveBeenCalledWith(
        {
          messages: [
            { role: 'system', content: 'You are a financial assistant.' },
            { role: 'user', content: 'Berapa saldo saya?' },
            {
              role: 'assistant',
              content: 'Saya membutuhkan akses data saldo Anda.',
            },
          ],
          temperature: 0.2,
        },
        {
          userId: 'user-id',
          feature: AI_USAGE_FEATURES.CHAT,
        },
      );
    });
    it('should limit conversation context before sending it to the AI provider', async () => {
      const messages = Array.from({ length: 25 }, (_, index) => ({
        id: `message-${index + 1}`,
        role: index % 2 === 0 ? AIMessageRole.USER : AIMessageRole.ASSISTANT,
        content: `Message ${index + 1}`,
        model: null,
        createdAt: new Date(
          `2026-09-30T10:${String(index).padStart(2, '0')}:00.000Z`,
        ),
      }));
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: null,
        messages: [],
      };
      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({ ...conversation, messages });
      aiConversationServiceMock.addMessage.mockResolvedValue({
        id: 'message-new',
        role: AIMessageRole.USER,
        content: 'Latest',
        model: null,
        createdAt: new Date(),
      });
      aiServiceMock.complete.mockResolvedValue({
        content: 'Response',
        provider: 'openai-compatible',
        model: 'test-model',
      });
      await service.sendMessage('user-id', 'conversation-id', 'Latest');
      const completionRequest = aiServiceMock.complete.mock.calls[0][0];
      expect(completionRequest.messages).toHaveLength(20);
      expect(completionRequest.messages[0]).toEqual({
        role: 'assistant',
        content: 'Message 6',
      });
      expect(completionRequest.messages[19]).toEqual({
        role: 'user',
        content: 'Message 25',
      });
    });
    it('should preserve system messages when limiting context', async () => {
      const messages = [
        {
          id: 'system-1',
          role: AIMessageRole.SYSTEM,
          content: 'You are a financial assistant.',
          model: null,
          createdAt: new Date('2026-09-30T10:00:00.000Z'),
        },
        ...Array.from({ length: 25 }, (_, index) => ({
          id: `message-${index + 1}`,
          role: index % 2 === 0 ? AIMessageRole.USER : AIMessageRole.ASSISTANT,
          content: `Message ${index + 1}`,
          model: null,
          createdAt: new Date(
            `2026-09-30T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
          ),
        })),
      ];
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: null,
        messages: [],
      };
      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({ ...conversation, messages });
      aiConversationServiceMock.addMessage.mockResolvedValue({
        id: 'message-new',
        role: AIMessageRole.USER,
        content: 'Latest',
        model: null,
        createdAt: new Date(),
      });
      aiServiceMock.complete.mockResolvedValue({
        content: 'Response',
        provider: 'openai-compatible',
        model: 'test-model',
      });
      await service.sendMessage('user-id', 'conversation-id', 'Latest');
      const completionRequest = aiServiceMock.complete.mock.calls[0][0];
      expect(completionRequest.messages).toHaveLength(20);
      expect(completionRequest.messages[0]).toEqual({
        role: 'system',
        content: 'You are a financial assistant.',
      });
      expect(completionRequest.messages[19]).toEqual({
        role: 'user',
        content: 'Message 25',
      });
    });
    it('should not send unsupported tool messages to the AI provider', async () => {
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: null,
        messages: [
          {
            id: 'message-1',
            role: AIMessageRole.SYSTEM,
            content: 'You are a financial assistant.',
            model: null,
            createdAt: new Date(),
          },
          {
            id: 'message-2',
            role: AIMessageRole.TOOL,
            content: 'tool result',
            model: null,
            createdAt: new Date(),
          },
        ],
      };
      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce(conversation);
      aiConversationServiceMock.addMessage.mockResolvedValue({
        id: 'message-3',
        role: AIMessageRole.USER,
        content: 'Hello',
        model: null,
        createdAt: new Date(),
      });
      aiServiceMock.complete.mockResolvedValue({
        content: 'Hello.',
        provider: 'openai-compatible',
        model: 'test-model',
      });
      await service.sendMessage('user-id', 'conversation-id', 'Hello');
      expect(aiServiceMock.complete).toHaveBeenCalledWith(
        {
          messages: [
            { role: 'system', content: 'You are a financial assistant.' },
          ],
          temperature: 0.2,
        },
        {
          userId: 'user-id',
          feature: AI_USAGE_FEATURES.CHAT,
        },
      );
    });
    it('should not persist an assistant message when AI completion fails', async () => {
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: null,
        messages: [],
      };
      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [
            ...conversation.messages,
            {
              id: 'user-message-id',
              role: AIMessageRole.USER,
              content: 'Hello',
              model: null,
              createdAt: new Date(),
            },
          ],
        });

      aiConversationServiceMock.addMessage.mockResolvedValueOnce({
        id: 'user-message-id',
        role: AIMessageRole.USER,
        content: 'Hello',
        model: null,
        createdAt: new Date(),
      });

      aiServiceMock.complete.mockRejectedValue(
        new ServiceUnavailableException('AI service is currently unavailable'),
      );

      await expect(
        service.sendMessage('user-id', 'conversation-id', 'Hello'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(aiConversationServiceMock.addMessage).toHaveBeenCalledTimes(1);

      expect(aiConversationServiceMock.addMessage).toHaveBeenCalledWith(
        'user-id',
        'conversation-id',
        AIMessageRole.USER,
        'Hello',
      );
    });
    it('should pass user identity and usage feature to AIService', async () => {
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: null,
        messages: [],
      };
      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [
            ...conversation.messages,
            {
              id: 'user-message-id',
              role: AIMessageRole.USER,
              content: 'Hello',
              model: null,
              createdAt: new Date(),
            },
          ],
        });

      aiConversationServiceMock.addMessage
        .mockResolvedValueOnce({
          id: 'user-message-id',
          role: AIMessageRole.USER,
          content: 'Hello',
          model: null,
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'assistant-message-id',
          role: AIMessageRole.ASSISTANT,
          content: 'Hello!',
          model: 'test-model',
          createdAt: new Date(),
        });

      aiServiceMock.complete.mockResolvedValue({
        content: 'Hello!',
        provider: 'openai-compatible',
        model: 'test-model',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
      });

      await service.sendMessage('user-id', 'conversation-id', 'Hello');

      expect(aiServiceMock.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.2,
        }),
        {
          userId: 'user-id',
          feature: AI_USAGE_FEATURES.CHAT,
        },
      );
    });
  });
});
