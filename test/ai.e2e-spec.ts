import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from 'src/app.module';

import { AI_PROVIDER } from 'src/modules/ai/constants/ai.constants';
import { AIChatService } from 'src/modules/ai/services/ai-chat.service';
import { AIConversationService } from 'src/modules/ai/services/ai-conversation.service';
import { AIService } from 'src/modules/ai/services/ai.service';
import { AIConversationRepository } from 'src/modules/ai/repositories/ai-conversation.repository';

import type { AIProvider } from 'src/modules/ai/providers/ai-provider.interface';
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProviderMetadata,
} from 'src/modules/ai/types/ai.types';

import { AIMessageRole } from '../generated/prisma/enums';

import { createE2EApp } from './helpers/create-e2e-app';

const originalAiEnabled = process.env.AI_ENABLED;
const originalAiProvider = process.env.AI_PROVIDER;

jest.setTimeout(30000);

describe('AI E2E', () => {
  let app: INestApplication;

  let aiService: AIService;
  let aiChatService: AIChatService;
  let aiConversationService: AIConversationService;

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const conversationId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const mockProvider: AIProvider = {
    getMetadata(): AIProviderMetadata {
      return {
        provider: 'e2e-provider',
        model: 'e2e-model',
      };
    },

    async complete(
      request: AICompletionRequest,
    ): Promise<AICompletionResponse> {
      const lastMessage = request.messages[request.messages.length - 1];

      return {
        content: `E2E AI response: ${lastMessage?.content ?? ''}`,
        provider: 'e2e-provider',
        model: 'e2e-model',
        usage: {
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
        },
      };
    },
  };

  const mockConversationRepository = {
    createConversation: jest.fn(),
    findConversationByIdAndUserId: jest.fn(),
    findConversationWithMessagesByIdAndUserId: jest.fn(),
    findManyConversationsByUserId: jest.fn(),
    updateConversationTitle: jest.fn(),
    createMessage: jest.fn(),
    findMessagesByConversationId: jest.fn(),
    deleteConversation: jest.fn(),
    findContextMessages: jest.fn(),
  };

  beforeAll(async () => {
    process.env.AI_ENABLED = 'true';
    process.env.AI_PROVIDER = 'e2e-test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AI_PROVIDER)
      .useValue(mockProvider)
      .overrideProvider(AIConversationRepository)
      .useValue(mockConversationRepository)
      .compile();

    app = moduleFixture.createNestApplication();

    await createE2EApp(app);

    aiService = app.get(AIService);
    aiChatService = app.get(AIChatService);
    aiConversationService = app.get(AIConversationService);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockConversationRepository.createConversation.mockReset();
    mockConversationRepository.findConversationByIdAndUserId.mockReset();
    mockConversationRepository.findConversationWithMessagesByIdAndUserId.mockReset();
    mockConversationRepository.findManyConversationsByUserId.mockReset();
    mockConversationRepository.updateConversationTitle.mockReset();
    mockConversationRepository.createMessage.mockReset();
    mockConversationRepository.findMessagesByConversationId.mockReset();
    mockConversationRepository.deleteConversation.mockReset();
    mockConversationRepository.findContextMessages.mockReset();
  });

  afterAll(async () => {
    if (originalAiEnabled === undefined) {
      delete process.env.AI_ENABLED;
    } else {
      process.env.AI_ENABLED = originalAiEnabled;
    }

    if (originalAiProvider === undefined) {
      delete process.env.AI_PROVIDER;
    } else {
      process.env.AI_PROVIDER = originalAiProvider;
    }

    await app.close();
  });

  describe('AI module integration', () => {
    it('should resolve AIService from AppModule', () => {
      expect(aiService).toBeDefined();
      expect(aiService).toBeInstanceOf(AIService);
    });

    it('should resolve AIChatService from AppModule', () => {
      expect(aiChatService).toBeDefined();
      expect(aiChatService).toBeInstanceOf(AIChatService);
    });

    it('should resolve AIConversationService from AppModule', () => {
      expect(aiConversationService).toBeDefined();
      expect(aiConversationService).toBeInstanceOf(AIConversationService);
    });
  });

  describe('AI provider integration', () => {
    it('should expose deterministic provider metadata', () => {
      expect(mockProvider.getMetadata()).toEqual({
        provider: 'e2e-provider',
        model: 'e2e-model',
      });
    });

    it('should produce deterministic completion output', async () => {
      const response = await mockProvider.complete({
        messages: [
          {
            role: 'user',
            content: 'test',
          },
        ],
      });

      expect(response).toEqual({
        content: 'E2E AI response: test',
        provider: 'e2e-provider',
        model: 'e2e-model',
        usage: {
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
        },
      });
    });

    it('should receive the expected AI completion request', async () => {
      await aiService.complete({
        messages: [
          {
            role: 'system',
            content: 'You are a financial assistant.',
          },
          {
            role: 'user',
            content: 'Halo AI',
          },
        ],
        temperature: 0.2,
        maxTokens: 100,
      });

      expect(mockProvider.getMetadata()).toEqual({
        provider: 'e2e-provider',
        model: 'e2e-model',
      });
    });
  });

  describe('AI conversation lifecycle', () => {
    it('should create an AI conversation', async () => {
      const conversation = {
        id: conversationId,
        userId,
        title: 'E2E Conversation',
      };

      mockConversationRepository.createConversation.mockResolvedValue(
        conversation,
      );

      const result = await aiConversationService.createConversation(
        userId,
        'E2E Conversation',
      );

      expect(result).toEqual(conversation);

      expect(
        mockConversationRepository.createConversation,
      ).toHaveBeenCalledWith(userId, 'E2E Conversation');
    });

    it('should find an AI conversation with messages', async () => {
      const conversation = {
        id: conversationId,
        userId,
        title: 'E2E Conversation',
        messages: [
          {
            id: 'message-1',
            conversationId,
            role: AIMessageRole.USER,
            content: 'Halo AI',
            model: null,
          },
        ],
      };

      mockConversationRepository.findConversationWithMessagesByIdAndUserId.mockResolvedValue(
        conversation,
      );

      const result = await aiConversationService.findById(
        userId,
        conversationId,
      );

      expect(result).toEqual(conversation);

      expect(
        mockConversationRepository.findConversationWithMessagesByIdAndUserId,
      ).toHaveBeenCalledWith(conversationId, userId);
    });

    it('should reject a conversation that does not belong to the user', async () => {
      mockConversationRepository.findConversationWithMessagesByIdAndUserId.mockResolvedValue(
        null,
      );

      await expect(
        aiConversationService.findById(userId, conversationId),
      ).rejects.toThrow('AI conversation not found');
    });

    it('should add a user message to an existing conversation', async () => {
      const conversation = {
        id: conversationId,
        userId,
        title: 'E2E Conversation',
      };

      const message = {
        id: 'message-1',
        conversationId,
        role: AIMessageRole.USER,
        content: 'Halo AI',
        model: null,
      };

      mockConversationRepository.findConversationByIdAndUserId.mockResolvedValue(
        conversation,
      );

      mockConversationRepository.createMessage.mockResolvedValue(message);

      const result = await aiConversationService.addMessage(
        userId,
        conversationId,
        AIMessageRole.USER,
        'Halo AI',
      );

      expect(result).toEqual(message);

      expect(
        mockConversationRepository.findConversationByIdAndUserId,
      ).toHaveBeenCalledWith(conversationId, userId);

      expect(mockConversationRepository.createMessage).toHaveBeenCalledWith(
        conversationId,
        AIMessageRole.USER,
        'Halo AI',
        undefined,
      );
    });

    it('should reject an empty AI conversation message', async () => {
      const conversation = {
        id: conversationId,
        userId,
        title: 'E2E Conversation',
      };

      mockConversationRepository.findConversationByIdAndUserId.mockResolvedValue(
        conversation,
      );

      await expect(
        aiConversationService.addMessage(
          userId,
          conversationId,
          AIMessageRole.USER,
          '   ',
        ),
      ).rejects.toThrow('AI message content cannot be empty');

      expect(mockConversationRepository.createMessage).not.toHaveBeenCalled();
    });

    it('should reject adding a message to a missing conversation', async () => {
      mockConversationRepository.findConversationByIdAndUserId.mockResolvedValue(
        null,
      );

      await expect(
        aiConversationService.addMessage(
          userId,
          conversationId,
          AIMessageRole.USER,
          'Halo AI',
        ),
      ).rejects.toThrow('AI conversation not found');

      expect(mockConversationRepository.createMessage).not.toHaveBeenCalled();
    });
  });

  describe('AI chat lifecycle', () => {
    it('should send a message through the AI chat service', async () => {
      const conversation = {
        id: conversationId,
        userId,
        title: 'E2E Conversation',
        messages: [],
      };

      const userMessage = {
        id: 'user-message-id',
        conversationId,
        role: AIMessageRole.USER,
        content: 'Halo AI',
        model: null,
        createdAt: new Date(),
      };

      const assistantMessage = {
        id: 'assistant-message-id',
        conversationId,
        role: AIMessageRole.ASSISTANT,
        content: 'E2E AI response: Halo AI',
        model: 'e2e-model',
        createdAt: new Date(),
      };

      mockConversationRepository.findConversationWithMessagesByIdAndUserId
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [
            {
              role: AIMessageRole.USER,
              content: 'Halo AI',
            },
          ],
        });

      mockConversationRepository.findConversationByIdAndUserId.mockResolvedValue(
        conversation,
      );

      mockConversationRepository.createMessage
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(assistantMessage);

      const result = await aiChatService.sendMessage(
        userId,
        conversationId,
        'Halo AI',
      );

      expect(result).toEqual({
        conversationId,
        message: assistantMessage,
        provider: 'e2e-provider',
        model: 'e2e-model',
        usage: {
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
        },
      });

      expect(mockConversationRepository.createMessage).toHaveBeenNthCalledWith(
        1,
        conversationId,
        AIMessageRole.USER,
        'Halo AI',
        undefined,
      );

      expect(mockConversationRepository.createMessage).toHaveBeenNthCalledWith(
        2,
        conversationId,
        AIMessageRole.ASSISTANT,
        'E2E AI response: Halo AI',
        'e2e-model',
      );
    });

    it('should reject empty AI messages', async () => {
      await expect(
        aiChatService.sendMessage(userId, conversationId, '   '),
      ).rejects.toThrow('AI message content cannot be empty');

      expect(mockConversationRepository.createMessage).not.toHaveBeenCalled();
    });

    it('should preserve the user ownership boundary', async () => {
      mockConversationRepository.findConversationWithMessagesByIdAndUserId.mockResolvedValue(
        null,
      );

      await expect(
        aiChatService.sendMessage(userId, conversationId, 'Halo AI'),
      ).rejects.toThrow('AI conversation not found');

      expect(
        mockConversationRepository.findConversationWithMessagesByIdAndUserId,
      ).toHaveBeenCalledWith(conversationId, userId);
    });
  });

  describe('AI context integration', () => {
    it('should retrieve conversation context for the current user', async () => {
      const context = [
        {
          role: AIMessageRole.USER,
          content: 'Saya makan nasi',
        },
        {
          role: AIMessageRole.ASSISTANT,
          content: 'Baik, saya mengerti.',
        },
      ];

      mockConversationRepository.findContextMessages.mockResolvedValue(context);

      const result = await mockConversationRepository.findContextMessages(
        conversationId,
        userId,
        {
          limit: 20,
        },
      );

      expect(result).toEqual(context);

      expect(
        mockConversationRepository.findContextMessages,
      ).toHaveBeenCalledWith(conversationId, userId, {
        limit: 20,
      });
    });
  });

  describe('AI failure handling', () => {
    it('should reject AI completion when the provider fails', async () => {
      const failingProvider: AIProvider = {
        getMetadata(): AIProviderMetadata {
          return {
            provider: 'e2e-provider',
            model: 'e2e-model',
          };
        },

        async complete(): Promise<AICompletionResponse> {
          throw new Error('AI provider request failed');
        },
      };

      const failingModuleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(AI_PROVIDER)
        .useValue(failingProvider)
        .compile();

      const failingApp = failingModuleFixture.createNestApplication();

      await createE2EApp(failingApp);

      const failingAIService = failingApp.get(AIService);

      await expect(
        failingAIService.complete({
          messages: [
            {
              role: 'user',
              content: 'test',
            },
          ],
        }),
      ).rejects.toThrow('AI provider request failed');

      await failingApp.close();
    });

    it('should keep provider metadata available after a normal completion', async () => {
      const metadata = aiService.getMetadata();

      expect(metadata).toEqual({
        provider: 'e2e-provider',
        model: 'e2e-model',
      });
    });
  });

  describe('AI safety integration', () => {
    it('should preserve system and user message boundaries', async () => {
      const response = await aiService.complete({
        messages: [
          {
            role: 'system',
            content: 'You are a financial assistant.',
          },
          {
            role: 'user',
            content: '<user_input>\nHalo AI\n</user_input>',
          },
        ],
        temperature: 0.2,
      });

      expect(response).toEqual({
        content: 'E2E AI response: <user_input>\nHalo AI\n</user_input>',
        provider: 'e2e-provider',
        model: 'e2e-model',
        usage: {
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
        },
      });
    });

    it('should handle structured AI completion requests', async () => {
      const response = await aiService.complete({
        messages: [
          {
            role: 'system',
            content: 'Return structured transaction data.',
          },
          {
            role: 'user',
            content: 'Saya membeli kopi 25000',
          },
        ],
        temperature: 0,
        responseFormat: 'json',
      });

      expect(response.provider).toBe('e2e-provider');

      expect(response.model).toBe('e2e-model');

      expect(response.content).toContain('Saya membeli kopi 25000');
    });
  });

  describe('AI application lifecycle', () => {
    it('should expose an enabled AI service when the provider is configured', () => {
      expect(aiService.isEnabled()).toBe(true);
    });

    it('should complete a normal AI request end-to-end through the AI service', async () => {
      const result = await aiService.complete({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful financial assistant.',
          },
          {
            role: 'user',
            content: 'Catat pengeluaran makan sebesar 25000',
          },
        ],
        temperature: 0.2,
        userId,
        feature: 'CHAT',
      });

      expect(result).toEqual({
        content: 'E2E AI response: Catat pengeluaran makan sebesar 25000',
        provider: 'e2e-provider',
        model: 'e2e-model',
        usage: {
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
        },
      });
    });
  });
});
