import { AIMessageRole } from '../../../../generated/prisma/enums';
import { AIChatService } from './ai-chat.service';
import { AIService } from './ai.service';
import { AIConversationService } from './ai-conversation.service';
import { AIConversationContextService } from './ai-conversation-context.service';
import { AIFinancialContextService } from './ai-financial-context.service';
import { AI_USAGE_FEATURES } from '../constants/ai-usage.constants';

describe('AIChatService communication policy', () => {
  const financialContext = {
    currency: 'IDR',
    summary: {
      income: '5000000.00',
      expense: '1000000.00',
      balance: '4000000.00',
      incomeCount: 1,
      expenseCount: 2,
    },
    expensesByCategory: [],
    recentTransactions: [],
    budgets: [],
  };

  it('should apply global instructions and sanitize every assistant response before persistence', async () => {
    const conversation = {
      id: 'conversation-1',
      userId: 'user-1',
      title: 'Financial chat',
      messages: [],
    };

    const userMessage = {
      id: 'user-message-1',
      role: AIMessageRole.USER,
      content: 'Jelaskan rekomendasi saya.',
      model: null,
      createdAt: new Date('2026-11-06T10:00:00.000Z'),
    };

    const assistantMessage = {
      id: 'assistant-message-1',
      role: AIMessageRole.ASSISTANT,
      content: 'Status: menunggu keputusan. Sistem perlu ditinjau kembali.',
      model: 'test-model',
      createdAt: new Date('2026-11-06T10:00:01.000Z'),
    };

    const conversationService = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [userMessage],
        }),

      addMessage: jest
        .fn()
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(assistantMessage),
    };

    const aiService = {
      complete: jest.fn().mockResolvedValue({
        content:
          '### Status: PENDING<br/>Data dari backend pada actionCenter perlu REVIEW.  ',
        provider: 'openai-compatible',
        model: 'test-model',
        usage: {
          inputTokens: 20,
          outputTokens: 15,
          totalTokens: 35,
        },
      }),
    };

    const financialContextService = {
      getContext: jest.fn().mockResolvedValue(financialContext),
    };

    const service = new AIChatService(
      conversationService as unknown as AIConversationService,
      aiService as unknown as AIService,
      new AIConversationContextService(),
      financialContextService as unknown as AIFinancialContextService,
    );

    await service.sendMessage(
      'user-1',
      'conversation-1',
      'Jelaskan rekomendasi saya.',
    );

    const persistedAssistantContent =
      conversationService.addMessage.mock.calls[1][3];

    expect(persistedAssistantContent).toBe(
      'Status: menunggu keputusan\n' +
        'Data dari sistem pada daftar rekomendasi yang perlu ditindaklanjuti perlu ditinjau kembali.',
    );

    const completionRequest = aiService.complete.mock.calls[0][0];
    const systemPrompt = completionRequest.messages[0].content as string;

    expect(systemPrompt).toContain('GAYA KOMUNIKASI UNTUK SELURUH PERCAKAPAN');

    expect(systemPrompt).toContain(
      'Jangan menyebut backend, database, server, API',
    );

    expect(aiService.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.2,
      }),
      {
        userId: 'user-1',
        feature: AI_USAGE_FEATURES.CHAT,
      },
    );
  });
});
