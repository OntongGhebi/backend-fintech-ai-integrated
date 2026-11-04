import { AIService } from '../ai/services/ai.service';

import { FinancialAnalysisService } from './financial-analysis.service';
import type { FinancialAnalysisOverview } from './financial-analysis.service';

import { FinancialInsightsService } from './financial-insights.service';

describe('FinancialInsightsService', () => {
  let service: FinancialInsightsService;

  const financialAnalysisServiceMock = {
    getOverview: jest.fn(),
  };

  const aiServiceMock = {
    complete: jest.fn(),
  };

  const createOverview = (
    overrides: Partial<FinancialAnalysisOverview> = {},
  ): FinancialAnalysisOverview => {
    const base = {
      generatedAt: '2026-11-04T10:00:00.000Z',
      currency: 'IDR',
      period: {
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-11-30T23:59:59.999Z',
      },
      summary: {
        totalIncome: '5000000.00',
        totalExpense: '4000000.00',
        netCashFlow: '1000000.00',
        transactionCount: 15,
        savingsRate: 20,
        expenseToIncomeRatio: 80,
        cashFlowStatus: 'POSITIVE' as const,
      },
      spendingPatterns: {
        totalExpense: '4000000.00',
        transactionCount: 12,
        topCategories: [
          {
            categoryId: 'food-id',
            categoryName: 'Food',
            totalAmount: '2000000.00',
            transactionCount: 6,
            percentage: 50,
          },
        ],
        topCategoryConcentration: 50,
      },
      budgetHealth: {
        totalAllocation: '5000000.00',
        totalSpent: '4000000.00',
        remaining: '1000000.00',
        utilizationPercentage: 80,
        budgetCount: 2,
        onTrackCount: 1,
        nearLimitCount: 1,
        overBudgetCount: 0,
      },
      trends: {
        monthly: [],
        income: {
          direction: 'INCREASED' as const,
          previousPeriod: '2026-10',
          currentPeriod: '2026-11',
          previousAmount: '2000000.00',
          currentAmount: '3000000.00',
          changeAmount: '1000000.00',
          changePercentage: 50,
        },
        expense: {
          direction: 'INCREASED' as const,
          previousPeriod: '2026-10',
          currentPeriod: '2026-11',
          previousAmount: '1500000.00',
          currentAmount: '2500000.00',
          changeAmount: '1000000.00',
          changePercentage: 66.67,
        },
        netCashFlow: {
          direction: 'UNCHANGED' as const,
          previousPeriod: '2026-10',
          currentPeriod: '2026-11',
          previousAmount: '1000000.00',
          currentAmount: '1000000.00',
          changeAmount: '0',
          changePercentage: 0,
        },
      },
      signals: [
        {
          code: 'BUDGET_NEAR_LIMIT' as const,
          severity: 'INFO' as const,
          title: 'Budget mendekati batas',
          description: 'Satu kategori telah mendekati batas alokasi budget.',
          metadata: {
            count: 1,
          },
        },
      ],
    };

    return {
      ...base,
      ...overrides,
    } as FinancialAnalysisOverview;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new FinancialInsightsService(
      financialAnalysisServiceMock as unknown as FinancialAnalysisService,
      aiServiceMock as unknown as AIService,
    );
  });

  describe('generate', () => {
    it('should generate insights from deterministic financial analysis', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview(),
      );

      aiServiceMock.complete.mockResolvedValue({
        content: JSON.stringify({
          insights: [
            {
              type: 'SPENDING_PATTERN',
              title: 'Pengeluaran terkonsentrasi pada kategori Food',
              description:
                'Pola pengeluaran menunjukkan konsentrasi pada kategori Food.',
              whyItMatters:
                'Konsentrasi yang tinggi dapat mengurangi fleksibilitas pengeluaran kategori lain.',
              suggestedActions: [
                'Tinjau kembali transaksi pada kategori Food.',
                'Evaluasi kebutuhan pengeluaran untuk periode berikutnya.',
              ],
              evidenceMetricKeys: [
                'spendingPatterns.topCategory.name',
                'spendingPatterns.topCategory.percentage',
              ],
            },
          ],
        }),
        provider: 'openai-compatible',
        model: 'test-model',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
      });

      const result = await service.generate('user-1');

      expect(result.status).toBe('GENERATED');
      expect(result.currency).toBe('IDR');
      expect(result.insights).toHaveLength(1);

      expect(result.insights[0]).toEqual({
        type: 'SPENDING_PATTERN',
        title: 'Pengeluaran terkonsentrasi pada kategori Food',
        description:
          'Pola pengeluaran menunjukkan konsentrasi pada kategori Food.',
        whyItMatters:
          'Konsentrasi yang tinggi dapat mengurangi fleksibilitas pengeluaran kategori lain.',
        suggestedActions: [
          'Tinjau kembali transaksi pada kategori Food.',
          'Evaluasi kebutuhan pengeluaran untuk periode berikutnya.',
        ],
        evidence: [
          {
            metricKey: 'spendingPatterns.topCategory.name',
            value: 'Food',
          },
          {
            metricKey: 'spendingPatterns.topCategory.percentage',
            value: 50,
          },
        ],
      });

      expect(result.provider).toBe('openai-compatible');
      expect(result.model).toBe('test-model');
      expect(result.usage?.totalTokens).toBe(150);
    });

    it('should pass date range to financial analysis service', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview(),
      );

      aiServiceMock.complete.mockResolvedValue({
        content: JSON.stringify({
          insights: [],
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const startDate = new Date('2026-10-01T00:00:00.000Z');
      const endDate = new Date('2026-11-30T16:59:59.999Z');

      await service.generate('user-1', {
        startDate,
        endDate,
      });

      expect(financialAnalysisServiceMock.getOverview).toHaveBeenCalledWith(
        'user-1',
        {
          startDate,
          endDate,
        },
      );
    });

    it('should not call AI when financial data is unavailable', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview({
          summary: {
            totalIncome: '0',
            totalExpense: '0',
            netCashFlow: '0',
            transactionCount: 0,
            savingsRate: null,
            expenseToIncomeRatio: null,
            cashFlowStatus: 'NO_INCOME_DATA',
          },
          spendingPatterns: {
            totalExpense: '0',
            transactionCount: 0,
            topCategories: [],
            topCategoryConcentration: 0,
          },
          budgetHealth: {
            totalAllocation: '0',
            totalSpent: '0',
            remaining: '0',
            utilizationPercentage: null,
            budgetCount: 0,
            onTrackCount: 0,
            nearLimitCount: 0,
            overBudgetCount: 0,
          },
          signals: [],
        }),
      );

      const result = await service.generate('user-1');

      expect(result.status).toBe('NO_INSIGHTS');
      expect(result.insights).toEqual([]);
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });

    it('should ignore evidence keys that do not exist in backend facts', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview(),
      );

      aiServiceMock.complete.mockResolvedValue({
        content: JSON.stringify({
          insights: [
            {
              type: 'BUDGET_HEALTH',
              title: 'Budget perlu diperhatikan',
              description: 'Penggunaan budget perlu dipantau secara berkala.',
              whyItMatters:
                'Pemantauan membantu menghindari pengeluaran berlebihan.',
              suggestedActions: [],
              evidenceMetricKeys: [
                'budgetHealth.utilizationPercentage',
                'some.fake.metric',
              ],
            },
          ],
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.generate('user-1');

      expect(result.status).toBe('GENERATED');
      expect(result.insights[0].evidence).toEqual([
        {
          metricKey: 'budgetHealth.utilizationPercentage',
          value: 80,
        },
      ]);
    });

    it('should reject insights without valid backend evidence', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview(),
      );

      aiServiceMock.complete.mockResolvedValue({
        content: JSON.stringify({
          insights: [
            {
              type: 'CASH_FLOW',
              title: 'Insight tanpa bukti',
              description: 'Deskripsi insight.',
              whyItMatters: 'Alasan insight.',
              suggestedActions: [],
              evidenceMetricKeys: ['unknown.metric'],
            },
          ],
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.generate('user-1');

      expect(result.status).toBe('NO_INSIGHTS');
      expect(result.insights).toEqual([]);
    });

    it('should limit the number of generated insights to five', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview(),
      );

      aiServiceMock.complete.mockResolvedValue({
        content: JSON.stringify({
          insights: Array.from({ length: 8 }, (_, index) => ({
            type: 'CASH_FLOW',
            title: `Insight ${index + 1}`,
            description: `Deskripsi insight ${index + 1}.`,
            whyItMatters: `Alasan insight ${index + 1}.`,
            suggestedActions: [],
            evidenceMetricKeys: ['summary.cashFlowStatus'],
          })),
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.generate('user-1');

      expect(result.insights).toHaveLength(5);
    });

    it('should ignore duplicate insights', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview(),
      );

      aiServiceMock.complete.mockResolvedValue({
        content: JSON.stringify({
          insights: [
            {
              type: 'CASH_FLOW',
              title: 'Arus kas perlu dipantau',
              description: 'Deskripsi pertama.',
              whyItMatters: 'Alasan pertama.',
              suggestedActions: [],
              evidenceMetricKeys: ['summary.cashFlowStatus'],
            },
            {
              type: 'CASH_FLOW',
              title: 'Arus kas perlu dipantau',
              description: 'Deskripsi kedua.',
              whyItMatters: 'Alasan kedua.',
              suggestedActions: [],
              evidenceMetricKeys: ['summary.netCashFlow'],
            },
          ],
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.generate('user-1');

      expect(result.insights).toHaveLength(1);
    });

    it('should return unavailable when AI returns invalid JSON', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview(),
      );

      aiServiceMock.complete.mockResolvedValue({
        content: 'This is not JSON',
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.generate('user-1');

      expect(result.status).toBe('UNAVAILABLE');
      expect(result.insights).toEqual([]);
      expect(result.provider).toBeNull();
      expect(result.model).toBeNull();
    });

    it('should return unavailable when AI provider fails', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview(),
      );

      aiServiceMock.complete.mockRejectedValue(
        new Error('AI provider unavailable'),
      );

      const result = await service.generate('user-1');

      expect(result.status).toBe('UNAVAILABLE');
      expect(result.insights).toEqual([]);
      expect(result.message).toContain('tidak tersedia');
    });

    it('should use the financial insights usage feature', async () => {
      financialAnalysisServiceMock.getOverview.mockResolvedValue(
        createOverview(),
      );

      aiServiceMock.complete.mockResolvedValue({
        content: JSON.stringify({
          insights: [],
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await service.generate('user-1');

      expect(aiServiceMock.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.2,
          maxTokens: 2500,
          responseFormat: 'text',
        }),
        {
          userId: 'user-1',
          feature: 'FINANCIAL_INSIGHTS',
        },
      );
    });
  });
});
