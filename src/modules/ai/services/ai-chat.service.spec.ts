import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AIMessageRole } from '../../../../generated/prisma/enums';
import { AIService } from './ai.service';
import { AIChatService } from './ai-chat.service';
import { AIConversationService } from './ai-conversation.service';
import { AIConversationContextService } from './ai-conversation-context.service';
import { AIFinancialContextService } from './ai-financial-context.service';
import { AI_USAGE_FEATURES } from '../constants/ai-usage.constants';

describe('AIChatService', () => {
  let service: AIChatService;

  const financialContext = {
    generatedAt: '2026-10-24T00:00:00.000Z',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    period: {
      startDate: '2026-10-01',
      endDateExclusive: '2026-11-01',
    },
    summary: {
      totalIncome: '5000000.00',
      totalExpense: '1750000.00',
      netCashFlow: '3250000.00',
      incomeTransactionCount: 3,
      expenseTransactionCount: 8,
    },
    expensesByCategory: [],
    recentTransactions: [],
    budgets: [],
  };

  const aiConversationServiceMock = {
    findById: jest.fn(),
    addMessage: jest.fn(),
  };

  const aiServiceMock = {
    complete: jest.fn(),
  };

  const aiFinancialContextServiceMock = {
    getContext: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    aiFinancialContextServiceMock.getContext.mockResolvedValue(
      financialContext,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIChatService,
        {
          provide: AIConversationService,
          useValue: aiConversationServiceMock,
        },
        {
          provide: AIService,
          useValue: aiServiceMock,
        },
        {
          provide: AIFinancialContextService,
          useValue: aiFinancialContextServiceMock,
        },
        AIConversationContextService,
      ],
    }).compile();

    service = module.get<AIChatService>(AIChatService);
  });

  const createConversation = (messages: any[] = []) => ({
    id: 'conversation-id',
    userId: 'user-id',
    title: 'Test conversation',
    messages,
  });

  const createMessage = (
    id: string,
    role: AIMessageRole,
    content: string,
    model: string | null = null,
  ) => ({
    id,
    role,
    content,
    model,
    createdAt: new Date('2026-10-24T10:00:00.000Z'),
  });

  const mockSuccessfulCompletion = () => {
    aiServiceMock.complete.mockResolvedValue({
      content: 'Respons AI',
      provider: 'openai-compatible',
      model: 'test-model',
      usage: {
        inputTokens: 10,
        outputTokens: 8,
        totalTokens: 18,
      },
    });
  };

  describe('sendMessage', () => {
    it('should persist the user message and return the assistant response', async () => {
      const conversation = createConversation();
      const userMessage = createMessage(
        'message-1',
        AIMessageRole.USER,
        'Halo AI',
      );
      const assistantMessage = createMessage(
        'message-2',
        AIMessageRole.ASSISTANT,
        'Respons AI',
        'test-model',
      );

      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [userMessage],
        });

      aiConversationServiceMock.addMessage
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(assistantMessage);

      mockSuccessfulCompletion();

      await expect(
        service.sendMessage('user-id', 'conversation-id', ' Halo AI '),
      ).resolves.toEqual({
        conversationId: 'conversation-id',
        message: assistantMessage,
        provider: 'openai-compatible',
        model: 'test-model',
        usage: {
          inputTokens: 10,
          outputTokens: 8,
          totalTokens: 18,
        },
      });

      expect(aiConversationServiceMock.addMessage).toHaveBeenNthCalledWith(
        1,
        'user-id',
        'conversation-id',
        AIMessageRole.USER,
        'Halo AI',
      );

      expect(aiConversationServiceMock.addMessage).toHaveBeenNthCalledWith(
        2,
        'user-id',
        'conversation-id',
        AIMessageRole.ASSISTANT,
        'Respons AI',
        'test-model',
      );
    });

    it('should pass the latest financial context to the AI provider', async () => {
      const conversation = createConversation();
      const userMessage = createMessage(
        'message-1',
        AIMessageRole.USER,
        'Berapa pemasukan saya?',
      );

      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [userMessage],
        });

      aiConversationServiceMock.addMessage
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(
          createMessage(
            'message-2',
            AIMessageRole.ASSISTANT,
            'Pemasukan Anda Rp5.000.000.',
            'test-model',
          ),
        );

      mockSuccessfulCompletion();

      await service.sendMessage(
        'user-id',
        'conversation-id',
        'Berapa pemasukan saya?',
      );

      expect(aiFinancialContextServiceMock.getContext).toHaveBeenCalledWith(
        'user-id',
      );

      const request = aiServiceMock.complete.mock.calls[0][0];

      expect(request.messages[0].role).toBe('system');
      expect(request.messages[0].content).toContain(
        'KONTEKS KEUANGAN PENGGUNA (JSON):',
      );
      expect(request.messages[0].content).toContain(
        JSON.stringify(financialContext),
      );

      expect(request.messages).toContainEqual({
        role: 'user',
        content: 'Berapa pemasukan saya?',
      });

      expect(aiServiceMock.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.2,
        }),
        {
          userId: 'user-id',
          feature: AI_USAGE_FEATURES.CHAT,
        },
      );
    });

    it('should reject an empty message before accessing the conversation', async () => {
      await expect(
        service.sendMessage('user-id', 'conversation-id', '   '),
      ).rejects.toThrow('AI message content cannot be empty');

      expect(aiConversationServiceMock.findById).not.toHaveBeenCalled();
      expect(aiFinancialContextServiceMock.getContext).not.toHaveBeenCalled();
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });

    it('should reject when the conversation does not exist', async () => {
      aiConversationServiceMock.findById.mockResolvedValueOnce(null);

      await expect(
        service.sendMessage('user-id', 'conversation-id', 'Hello'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(aiConversationServiceMock.addMessage).not.toHaveBeenCalled();
      expect(aiFinancialContextServiceMock.getContext).not.toHaveBeenCalled();
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });

    it('should propagate a conversation lookup error', async () => {
      aiConversationServiceMock.findById.mockRejectedValueOnce(
        new NotFoundException('AI conversation not found'),
      );

      await expect(
        service.sendMessage('user-id', 'conversation-id', 'Hello'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(aiConversationServiceMock.addMessage).not.toHaveBeenCalled();
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });

    it('should not call the AI provider when persisting the user message fails', async () => {
      aiConversationServiceMock.findById.mockResolvedValueOnce(
        createConversation(),
      );

      aiConversationServiceMock.addMessage.mockRejectedValueOnce(
        new Error('Database error'),
      );

      await expect(
        service.sendMessage('user-id', 'conversation-id', 'Hello'),
      ).rejects.toThrow('Database error');

      expect(aiServiceMock.complete).not.toHaveBeenCalled();
      expect(aiFinancialContextServiceMock.getContext).not.toHaveBeenCalled();
    });

    it('should reject if the conversation cannot be reloaded after saving the user message', async () => {
      aiConversationServiceMock.findById
        .mockResolvedValueOnce(createConversation())
        .mockResolvedValueOnce(null);

      aiConversationServiceMock.addMessage.mockResolvedValueOnce(
        createMessage('message-1', AIMessageRole.USER, 'Hello'),
      );

      await expect(
        service.sendMessage('user-id', 'conversation-id', 'Hello'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(aiFinancialContextServiceMock.getContext).not.toHaveBeenCalled();
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });

    it('should not persist an assistant message when the AI provider fails', async () => {
      const conversation = createConversation();
      const userMessage = createMessage(
        'message-1',
        AIMessageRole.USER,
        'Hello',
      );

      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [userMessage],
        });

      aiConversationServiceMock.addMessage.mockResolvedValueOnce(userMessage);

      aiServiceMock.complete.mockRejectedValueOnce(
        new ServiceUnavailableException('AI provider request failed'),
      );

      await expect(
        service.sendMessage('user-id', 'conversation-id', 'Hello'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(aiConversationServiceMock.addMessage).toHaveBeenCalledTimes(1);
    });

    it('should propagate financial context errors and not call the AI provider', async () => {
      const conversation = createConversation();
      const userMessage = createMessage(
        'message-1',
        AIMessageRole.USER,
        'Berapa pengeluaran saya?',
      );

      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [userMessage],
        });

      aiConversationServiceMock.addMessage.mockResolvedValueOnce(userMessage);

      aiFinancialContextServiceMock.getContext.mockRejectedValueOnce(
        new Error('Financial context query failed'),
      );

      await expect(
        service.sendMessage(
          'user-id',
          'conversation-id',
          'Berapa pengeluaran saya?',
        ),
      ).rejects.toThrow('Financial context query failed');

      expect(aiServiceMock.complete).not.toHaveBeenCalled();
      expect(aiConversationServiceMock.addMessage).toHaveBeenCalledTimes(1);
    });

    it('should preserve conversation history and add financial context', async () => {
      const history = [
        createMessage(
          'message-1',
          AIMessageRole.USER,
          'Berapa pengeluaran saya?',
        ),
        createMessage(
          'message-2',
          AIMessageRole.ASSISTANT,
          'Pengeluaran Anda Rp1.750.000.',
          'test-model',
        ),
        createMessage(
          'message-3',
          AIMessageRole.USER,
          'Bagaimana dengan pemasukan?',
        ),
      ];

      const conversation = createConversation(history);
      const latestUserMessage = createMessage(
        'message-4',
        AIMessageRole.USER,
        'Lanjutkan',
      );

      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [...history, latestUserMessage],
        });

      aiConversationServiceMock.addMessage
        .mockResolvedValueOnce(latestUserMessage)
        .mockResolvedValueOnce(
          createMessage(
            'message-5',
            AIMessageRole.ASSISTANT,
            'Baik.',
            'test-model',
          ),
        );

      mockSuccessfulCompletion();

      await service.sendMessage('user-id', 'conversation-id', 'Lanjutkan');

      const request = aiServiceMock.complete.mock.calls[0][0];
      const messages = request.messages as Array<{
        role: string;
        content: string;
      }>;

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain(
        'KONTEKS KEUANGAN PENGGUNA (JSON):',
      );

      expect(messages).toContainEqual({
        role: 'user',
        content: 'Berapa pengeluaran saya?',
      });

      expect(messages).toContainEqual({
        role: 'assistant',
        content: 'Pengeluaran Anda Rp1.750.000.',
      });

      expect(messages).toContainEqual({
        role: 'user',
        content: 'Lanjutkan',
      });
    });

    it('should not send unsupported tool messages to the AI provider', async () => {
      const conversation = createConversation([
        createMessage(
          'message-1',
          AIMessageRole.SYSTEM,
          'You are a financial assistant.',
        ),
        createMessage('message-2', AIMessageRole.TOOL, 'tool result'),
      ]);

      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce(conversation);

      aiConversationServiceMock.addMessage
        .mockResolvedValueOnce(
          createMessage('message-3', AIMessageRole.USER, 'Hello'),
        )
        .mockResolvedValueOnce(
          createMessage(
            'message-4',
            AIMessageRole.ASSISTANT,
            'Hello!',
            'test-model',
          ),
        );

      mockSuccessfulCompletion();

      await service.sendMessage('user-id', 'conversation-id', 'Hello');

      const request = aiServiceMock.complete.mock.calls[0][0];
      const messages = request.messages as Array<{
        role: string;
        content: string;
      }>;

      expect(
        messages.some((message) => message.content === 'tool result'),
      ).toBe(false);
    });

    it('should pass user identity and usage feature to AIService', async () => {
      const conversation = createConversation();
      const userMessage = createMessage(
        'message-1',
        AIMessageRole.USER,
        'Hello',
      );

      aiConversationServiceMock.findById
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [userMessage],
        });

      aiConversationServiceMock.addMessage
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(
          createMessage(
            'message-2',
            AIMessageRole.ASSISTANT,
            'Hello!',
            'test-model',
          ),
        );

      mockSuccessfulCompletion();

      await service.sendMessage('user-id', 'conversation-id', 'Hello');

      expect(aiServiceMock.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.any(Array),
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
