import { Test, TestingModule } from '@nestjs/testing';
import { AIMessageRole } from '../../../../generated/prisma/enums';

import { AIService } from './ai.service';
import { AIChatService } from './ai-chat.service';
import { AIConversationService } from './ai-conversation.service';
import { AIConversationContextService } from './ai-conversation-context.service';
import { AIFinancialContextService } from './ai-financial-context.service';
import { AI_USAGE_FEATURES } from '../constants/ai-usage.constants';

describe('AIChatService - Budget Scope Integration', () => {
  let service: AIChatService;

  const userId = 'user-id';
  const conversationId = 'conversation-id';

  const financialContext = {
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    period: {
      start: new Date('2026-11-01T00:00:00.000Z'),
      end: new Date('2026-12-01T00:00:00.000Z'),
    },
    summary: {
      income: '5000000.00',
      expense: '1750000.00',
      balance: '3250000.00',
      incomeCount: 3,
      expenseCount: 8,
    },
    expensesByCategory: [],
    recentTransactions: [],
    budgets: [],
    financialWellBeing: {
      generatedAt: '2026-11-18T10:00:00.000Z',
      recommendationSummary: {
        total: 4,
        byStatus: {
          PENDING: 4,
          ACCEPTED: 0,
          REJECTED: 0,
          DEFERRED: 0,
          APPLIED: 0,
          EVALUATED: 0,
        },
        returnedRecommendationCount: 4,
        isTruncated: false,
      },
      actionCenter: [],
      recentRecommendations: [
        {
          id: 'recommendation-all',
          budgetId: 'budget-all',
          budgetName: 'Semua Pengeluaran',
          category: null,
          targetMonth: '2026-12',
          currentAllocation: '1000000.00',
          proposedAllocation: '1100000.00',
          changeAmount: '100000.00',
          changePercentage: '10.00',
          action: 'INCREASE',
          status: 'PENDING',
          reason: 'Penyesuaian seluruh pengeluaran.',
          guardrails: [],
          aiExplanation: null,
          deferredUntil: null,
          rejectionReason: null,
          appliedAt: null,
          evaluatedAt: null,
          evaluationStatus: null,
          evaluation: null,
          createdAt: '2026-11-18T09:00:00.000Z',
          budgetScope: {
            type: 'ALL_EXPENSES',
            categoryNames: [],
            includesUncategorized: true,
          },
        },
        {
          id: 'recommendation-category',
          budgetId: 'budget-category',
          budgetName: 'Anggaran Makanan',
          category: 'Food',
          targetMonth: '2026-12',
          currentAllocation: '500000.00',
          proposedAllocation: '450000.00',
          changeAmount: '-50000.00',
          changePercentage: '-10.00',
          action: 'DECREASE',
          status: 'PENDING',
          reason: 'Penyesuaian pengeluaran makanan.',
          guardrails: [],
          aiExplanation: null,
          deferredUntil: null,
          rejectionReason: null,
          appliedAt: null,
          evaluatedAt: null,
          evaluationStatus: null,
          evaluation: null,
          createdAt: '2026-11-18T09:01:00.000Z',
          budgetScope: {
            type: 'CATEGORY',
            categoryNames: ['Food'],
            includesUncategorized: false,
          },
        },
        {
          id: 'recommendation-group',
          budgetId: 'budget-group',
          budgetName: 'Anggaran Kebutuhan',
          category: 'Needs',
          targetMonth: '2026-12',
          currentAllocation: '800000.00',
          proposedAllocation: '850000.00',
          changeAmount: '50000.00',
          changePercentage: '6.25',
          action: 'INCREASE',
          status: 'PENDING',
          reason: 'Penyesuaian kelompok kebutuhan.',
          guardrails: [],
          aiExplanation: null,
          deferredUntil: null,
          rejectionReason: null,
          appliedAt: null,
          evaluatedAt: null,
          evaluationStatus: null,
          evaluation: null,
          createdAt: '2026-11-18T09:02:00.000Z',
          budgetScope: {
            type: 'CATEGORY_GROUP',
            categoryNames: ['Needs', 'Food', 'Transport'],
            includesUncategorized: false,
          },
        },
        {
          id: 'recommendation-custom',
          budgetId: 'budget-custom',
          budgetName: 'Anggaran Pilihan',
          category: null,
          targetMonth: '2026-12',
          currentAllocation: '200000.00',
          proposedAllocation: '200000.00',
          changeAmount: '0.00',
          changePercentage: '0.00',
          action: 'MAINTAIN',
          status: 'PENDING',
          reason: 'Alokasi tetap dipertahankan.',
          guardrails: [],
          aiExplanation: null,
          deferredUntil: null,
          rejectionReason: null,
          appliedAt: null,
          evaluatedAt: null,
          evaluationStatus: null,
          evaluation: null,
          createdAt: '2026-11-18T09:03:00.000Z',
          budgetScope: {
            type: 'CUSTOM',
            categoryNames: ['Internet', 'Subscriptions'],
            includesUncategorized: false,
          },
        },
      ],
    },
  };

  const conversation = {
    id: conversationId,
    userId,
    title: 'Test conversation',
    messages: [],
  };

  const userMessage = {
    id: 'message-user',
    role: AIMessageRole.USER,
    content: 'Jelaskan rekomendasi anggaran bulan depan.',
    model: null,
    createdAt: new Date('2026-11-18T10:00:00.000Z'),
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

  const getSystemPrompt = (): string => {
    const request = aiServiceMock.complete.mock.calls[0][0];

    const systemMessage = request.messages.find(
      (message: { role: string }) => message.role === 'system',
    );

    expect(systemMessage).toBeDefined();

    return systemMessage.content as string;
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    aiConversationServiceMock.findById
      .mockResolvedValueOnce(conversation)
      .mockResolvedValueOnce({
        ...conversation,
        messages: [userMessage],
      });

    aiConversationServiceMock.addMessage
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce({
        id: 'message-assistant',
        role: AIMessageRole.ASSISTANT,
        content: 'Berikut penjelasan rekomendasi anggaran.',
        model: 'test-model',
        createdAt: new Date('2026-11-18T10:01:00.000Z'),
      });

    aiFinancialContextServiceMock.getContext.mockResolvedValue(
      financialContext,
    );

    aiServiceMock.complete.mockResolvedValue({
      content: 'Berikut penjelasan rekomendasi anggaran.',
      provider: 'openai-compatible',
      model: 'test-model',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIChatService,
        AIConversationContextService,
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
      ],
    }).compile();

    service = module.get<AIChatService>(AIChatService);
  });

  it('should pass all budget scope types to the AI system prompt', async () => {
    await service.sendMessage(
      userId,
      conversationId,
      'Jelaskan rekomendasi anggaran bulan depan.',
    );

    expect(aiFinancialContextServiceMock.getContext).toHaveBeenCalledWith(
      userId,
    );

    expect(aiServiceMock.complete).toHaveBeenCalledTimes(1);

    const prompt = getSystemPrompt();

    expect(prompt).toContain('"type":"ALL_EXPENSES"');
    expect(prompt).toContain('"type":"CATEGORY"');
    expect(prompt).toContain('"type":"CATEGORY_GROUP"');
    expect(prompt).toContain('"type":"CUSTOM"');

    expect(prompt).toContain('"includesUncategorized":true');
    expect(prompt).toContain('"categoryNames":["Needs","Food","Transport"]');
    expect(prompt).toContain('"categoryNames":["Internet","Subscriptions"]');
  });

  it('should preserve the recommendation allocation and lifecycle data in the prompt', async () => {
    await service.sendMessage(
      userId,
      conversationId,
      'Jelaskan rekomendasi anggaran bulan depan.',
    );

    const prompt = getSystemPrompt();

    expect(prompt).toContain('"targetMonth":"2026-12"');
    expect(prompt).toContain('"currentAllocation":"500000.00"');
    expect(prompt).toContain('"proposedAllocation":"450000.00"');
    expect(prompt).toContain('"status":"PENDING"');
    expect(prompt).toContain('"action":"DECREASE"');
  });

  it('should preserve MAINTAIN recommendation with unchanged allocation', async () => {
    await service.sendMessage(
      userId,
      conversationId,
      'Mengapa alokasi Internet tidak berubah?',
    );

    const prompt = getSystemPrompt();

    expect(prompt).toContain('"id":"recommendation-custom"');
    expect(prompt).toContain('"action":"MAINTAIN"');

    expect(prompt).toContain('"currentAllocation":"200000.00"');
    expect(prompt).toContain('"proposedAllocation":"200000.00"');

    expect(prompt).toContain('"currentAllocationDisplay":"Rp200.000"');
    expect(prompt).toContain('"proposedAllocationDisplay":"Rp200.000"');

    expect(prompt).toContain('"changeAmount":"0.00"');
    expect(prompt).toContain('"changeAmountDisplay":"Rp0"');

    expect(prompt).toContain('"changePercentage":"0.00"');
    expect(prompt).toContain('"reason":"Alokasi tetap dipertahankan."');

    expect(prompt).toContain(
      'MAINTAIN berarti alokasi saat ini disarankan tetap.',
    );
  });

  it('should preserve zero allocation change without converting it into an increase or decrease', async () => {
    await service.sendMessage(
      userId,
      conversationId,
      'Apakah ada perubahan pada anggaran Internet?',
    );

    const prompt = getSystemPrompt();

    expect(prompt).toContain('"action":"MAINTAIN"');
    expect(prompt).toContain('"currentAllocation":"200000.00"');
    expect(prompt).toContain('"proposedAllocation":"200000.00"');
    expect(prompt).toContain('"changeAmount":"0.00"');
    expect(prompt).toContain('"changePercentage":"0.00"');

    expect(prompt).toContain(
      'MAINTAIN berarti alokasi saat ini disarankan tetap.',
    );
  });

  it('should preserve INCREASE and DECREASE actions with their allocation values', async () => {
    await service.sendMessage(
      userId,
      conversationId,
      'Bandingkan rekomendasi kenaikan dan penurunan anggaran.',
    );

    const prompt = getSystemPrompt();

    // INCREASE recommendation
    expect(prompt).toContain('"id":"recommendation-all"');
    expect(prompt).toContain('"action":"INCREASE"');
    expect(prompt).toContain('"currentAllocation":"1000000.00"');
    expect(prompt).toContain('"proposedAllocation":"1100000.00"');
    expect(prompt).toContain('"changeAmount":"100000.00"');

    // DECREASE recommendation
    expect(prompt).toContain('"id":"recommendation-category"');
    expect(prompt).toContain('"action":"DECREASE"');
    expect(prompt).toContain('"currentAllocation":"500000.00"');
    expect(prompt).toContain('"proposedAllocation":"450000.00"');
    expect(prompt).toContain('"changeAmount":"-50000.00"');
  });

  it('should retain the AI chat usage feature and user identity', async () => {
    await service.sendMessage(
      userId,
      conversationId,
      'Jelaskan rekomendasi anggaran bulan depan.',
    );

    expect(aiServiceMock.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.2,
        messages: expect.any(Array),
      }),
      {
        userId,
        feature: AI_USAGE_FEATURES.CHAT,
      },
    );
  });

  it('should not call the AI provider when financial context retrieval fails', async () => {
    aiFinancialContextServiceMock.getContext.mockRejectedValueOnce(
      new Error('Financial context query failed'),
    );

    await expect(
      service.sendMessage(
        userId,
        conversationId,
        'Jelaskan rekomendasi anggaran bulan depan.',
      ),
    ).rejects.toThrow('Financial context query failed');

    expect(aiServiceMock.complete).not.toHaveBeenCalled();
  });
});
