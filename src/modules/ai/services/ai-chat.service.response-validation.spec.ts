import { ServiceUnavailableException } from '@nestjs/common';
import { AIMessageRole } from '../../../../generated/prisma/enums';

import { AIChatService } from './ai-chat.service';
import { AIConversationService } from './ai-conversation.service';
import { AIConversationContextService } from './ai-conversation-context.service';
import { AIFinancialContextService } from './ai-financial-context.service';
import { AIService } from './ai.service';

describe('AIChatService response validation', () => {
  const userId = 'user-id';
  const conversationId = 'conversation-id';

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

  function createService(providerContent: string) {
    const conversation = {
      id: conversationId,
      userId,
      title: 'Test conversation',
      messages: [],
    };

    const userMessage = {
      id: 'user-message-id',
      role: AIMessageRole.USER,
      content: 'Jelaskan rekomendasi anggaran saya.',
      model: null,
      createdAt: new Date('2026-10-24T10:00:00.000Z'),
    };

    const aiConversationServiceMock = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(conversation)
        .mockResolvedValueOnce({
          ...conversation,
          messages: [userMessage],
        }),

      addMessage: jest
        .fn()
        .mockImplementation(
          async (
            _userId: string,
            _conversationId: string,
            role: AIMessageRole,
            content: string,
            model: string | null = null,
          ) => ({
            id:
              role === AIMessageRole.USER
                ? 'user-message-id'
                : 'assistant-message-id',
            role,
            content,
            model,
            createdAt: new Date('2026-10-24T10:00:00.000Z'),
          }),
        ),
    };

    const aiServiceMock = {
      complete: jest.fn().mockResolvedValue({
        content: providerContent,
        provider: 'openai-compatible',
        model: 'test-model',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
      }),
    };

    const aiConversationContextServiceMock = {
      getContext: jest.fn(
        (messages: Array<{ role: AIMessageRole; content: string }>) => messages,
      ),
    };

    const aiFinancialContextServiceMock = {
      getContext: jest.fn().mockResolvedValue(financialContext),
    };

    const service = new AIChatService(
      aiConversationServiceMock as unknown as AIConversationService,
      aiServiceMock as unknown as AIService,
      aiConversationContextServiceMock as unknown as AIConversationContextService,
      aiFinancialContextServiceMock as unknown as AIFinancialContextService,
    );

    return {
      service,
      aiConversationServiceMock,
      aiServiceMock,
      aiFinancialContextServiceMock,
    };
  }

  describe('assistant response persistence', () => {
    it('should sanitize provider response before returning and persisting it', async () => {
      const providerContent = [
        '### Ringkasan rekomendasi',
        '',
        'Data dari backend menunjukkan currentAllocation sebesar Rp200.000.',
        '',
        'Rekomendasi masih berstatus PENDING.',
      ].join('\n');

      const expectedContent = [
        'Ringkasan rekomendasi',
        '',
        'Data dari sistem menunjukkan anggaran saat ini sebesar Rp200.000.',
        '',
        'Rekomendasi masih berstatus menunggu keputusan.',
      ].join('\n');

      const { service, aiConversationServiceMock, aiServiceMock } =
        createService(providerContent);

      const result = await service.sendMessage(
        userId,
        conversationId,
        'Jelaskan rekomendasi anggaran saya.',
      );

      expect(result.message.content).toBe(expectedContent);

      expect(aiConversationServiceMock.addMessage).toHaveBeenNthCalledWith(
        2,
        userId,
        conversationId,
        AIMessageRole.ASSISTANT,
        expectedContent,
        'test-model',
      );

      expect(aiServiceMock.complete).toHaveBeenCalledTimes(1);
    });

    it.each([
      {
        action: 'MAINTAIN',
        providerContent:
          'Alokasi Internet tetap Rp200.000. Tidak ada perubahan dari anggaran saat ini.',
        expectedContent:
          'Alokasi Internet tetap Rp200.000. Tidak ada perubahan dari anggaran saat ini.',
      },
      {
        action: 'INCREASE',
        providerContent:
          'Anggaran Food disarankan naik dari Rp500.000 menjadi Rp550.000, bertambah Rp50.000.',
        expectedContent:
          'Anggaran Food disarankan naik dari Rp500.000 menjadi Rp550.000, bertambah Rp50.000.',
      },
      {
        action: 'DECREASE',
        providerContent:
          'Anggaran Transport disarankan turun dari Rp400.000 menjadi Rp350.000, berkurang Rp50.000.',
        expectedContent:
          'Anggaran Transport disarankan turun dari Rp400.000 menjadi Rp350.000, berkurang Rp50.000.',
      },
    ])(
      'should preserve financial amounts and explanation for $action recommendations',
      async ({ providerContent, expectedContent }) => {
        const { service, aiConversationServiceMock } =
          createService(providerContent);

        const result = await service.sendMessage(
          userId,
          conversationId,
          'Jelaskan rekomendasi anggaran saya.',
        );

        expect(result.message.content).toBe(expectedContent);

        expect(aiConversationServiceMock.addMessage).toHaveBeenNthCalledWith(
          2,
          userId,
          conversationId,
          AIMessageRole.ASSISTANT,
          expectedContent,
          'test-model',
        );
      },
    );

    it('should preserve lifecycle meaning without exposing internal status terms', async () => {
      const providerContent =
        'Rekomendasi masih PENDING. Setelah ACCEPTED, anggaran belum APPLIED.';

      const expectedContent =
        'Rekomendasi masih menunggu keputusan. Setelah disetujui, anggaran belum diterapkan.';

      const { service, aiConversationServiceMock } =
        createService(providerContent);

      const result = await service.sendMessage(
        userId,
        conversationId,
        'Apakah rekomendasi saya sudah diterapkan?',
      );

      expect(result.message.content).toBe(expectedContent);

      expect(result.message.content).not.toMatch(
        /\bPENDING\b|\bACCEPTED\b|\bAPPLIED\b/,
      );

      expect(aiConversationServiceMock.addMessage).toHaveBeenNthCalledWith(
        2,
        userId,
        conversationId,
        AIMessageRole.ASSISTANT,
        expectedContent,
        'test-model',
      );
    });

    it('should keep the returned response identical to the persisted response', async () => {
      const providerContent = '**Alokasi Internet** tetap sebesar Rp200.000.';

      const expectedContent = 'Alokasi Internet tetap sebesar Rp200.000.';

      const { service, aiConversationServiceMock } =
        createService(providerContent);

      const result = await service.sendMessage(
        userId,
        conversationId,
        'Bagaimana anggaran Internet saya?',
      );

      const persistedAssistantCall =
        aiConversationServiceMock.addMessage.mock.calls.find(
          (call) => call[2] === AIMessageRole.ASSISTANT,
        );

      expect(persistedAssistantCall).toBeDefined();
      expect(persistedAssistantCall[3]).toBe(expectedContent);
      expect(result.message.content).toBe(persistedAssistantCall[3]);
    });
  });

  describe('empty provider response', () => {
    it('should reject an empty response and avoid persisting an assistant message', async () => {
      const { service, aiConversationServiceMock } = createService('   ');

      await expect(
        service.sendMessage(
          userId,
          conversationId,
          'Jelaskan rekomendasi anggaran saya.',
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(aiConversationServiceMock.addMessage).toHaveBeenCalledTimes(1);

      expect(aiConversationServiceMock.addMessage).toHaveBeenCalledWith(
        userId,
        conversationId,
        AIMessageRole.USER,
        'Jelaskan rekomendasi anggaran saya.',
      );

      expect(
        aiConversationServiceMock.addMessage.mock.calls.some(
          (call) => call[2] === AIMessageRole.ASSISTANT,
        ),
      ).toBe(false);
    });

    it('should reject a response containing only removable formatting', async () => {
      const { service, aiConversationServiceMock } =
        createService('```markdown\n```');

      await expect(
        service.sendMessage(
          userId,
          conversationId,
          'Jelaskan rekomendasi anggaran saya.',
        ),
      ).rejects.toThrow('AI provider returned an empty response.');

      expect(
        aiConversationServiceMock.addMessage.mock.calls.some(
          (call) => call[2] === AIMessageRole.ASSISTANT,
        ),
      ).toBe(false);
    });
  });
});
