import { buildAIFinancialContextPrompt } from './ai-financial-context-prompt.util';

describe('AI financial well-being context prompt', () => {
  const context = {
    currency: 'IDR',

    summary: {
      income: '5000000.00',
      expense: '3000000.00',
      balance: '2000000.00',
      incomeCount: 3,
      expenseCount: 8,
    },

    expensesByCategory: [
      {
        category: 'Food',
        amount: '1500000.00',
      },
    ],

    recentTransactions: [],

    budgets: [
      {
        id: 'budget-1',
        name: 'Budget Makanan',
        currency: 'IDR',
        limit: '1000000.00',
        spent: '900000.00',
        remaining: '100000.00',
        usagePercentage: 90,
        period: 'MONTHLY',
        periodStart: new Date('2026-12-01T00:00:00.000Z'),
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T16:59:59.999Z'),
      },
    ],

    financialWellBeing: {
      generatedAt: '2026-12-01T00:00:00.000Z',

      recommendationSummary: {
        total: 3,
        byStatus: {
          PENDING: 1,
          ACCEPTED: 1,
          REJECTED: 0,
          DEFERRED: 0,
          APPLIED: 1,
          EVALUATED: 0,
        },
        returnedRecommendationCount: 3,
        isTruncated: false,
      },

      actionCenter: [
        {
          id: 'recommendation-1',
          budgetId: 'budget-1',
          budgetName: 'Budget Makanan',
          category: 'Food',
          targetMonth: '2027-01',
          currentAllocation: '1000000.00',
          proposedAllocation: '1200000.00',
          changeAmount: '200000.00',
          changePercentage: '20',
          action: 'INCREASE' as const,
          status: 'PENDING' as const,
          reason: 'Pengeluaran aktual melebihi alokasi.',
          guardrails: ['Belum diterapkan otomatis.'],
          aiExplanation: 'Alokasi dapat disesuaikan.',
          deferredUntil: null,
          rejectionReason: null,
          appliedAt: null,
          evaluatedAt: null,
          evaluationStatus: null,
          evaluation: null,
          createdAt: '2026-12-01T00:00:00.000Z',
        },
      ],

      recentRecommendations: [
        {
          id: 'recommendation-1',
          budgetId: 'budget-1',
          budgetName: 'Budget Makanan',
          category: 'Food',
          targetMonth: '2027-01',
          currentAllocation: '1000000.00',
          proposedAllocation: '1200000.00',
          changeAmount: '200000.00',
          changePercentage: '20',
          action: 'INCREASE' as const,
          status: 'PENDING' as const,
          reason: 'Pengeluaran aktual melebihi alokasi.',
          guardrails: ['Belum diterapkan otomatis.'],
          aiExplanation: 'Alokasi dapat disesuaikan.',
          deferredUntil: null,
          rejectionReason: null,
          appliedAt: null,
          evaluatedAt: null,
          evaluationStatus: null,
          evaluation: null,
          createdAt: '2026-12-01T00:00:00.000Z',
        },
      ],
    },
  };

  it('should include financial well-being data in the prompt', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain('"financialWellBeing"');
    expect(prompt).toContain('"recommendationSummary"');
    expect(prompt).toContain('"actionCenter"');
    expect(prompt).toContain('"recentRecommendations"');
  });

  it('should format recommendation allocation amounts using the backend currency', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain('"currentAllocationDisplay":"Rp1.000.000"');
    expect(prompt).toContain('"proposedAllocationDisplay":"Rp1.200.000"');
    expect(prompt).toContain('"changeAmountDisplay":"Rp200.000"');
  });

  it('should explain the difference between accepted and applied recommendations', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain(
      'ACCEPTED berarti pengguna menyetujui rekomendasi, tetapi alokasi belum tentu sudah diterapkan.',
    );

    expect(prompt).toContain(
      'APPLIED berarti perubahan alokasi sudah diterapkan ke budget.',
    );
  });

  it('should prohibit the chatbot from changing recommendation lifecycle state', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain(
      'Jangan mengubah budget, menerima, menolak, menunda, atau menerapkan rekomendasi melalui percakapan.',
    );

    expect(prompt).toContain('Chatbot hanya memberikan penjelasan dan saran.');
  });

  it('should instruct the model to respect recommendation truncation', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain(
      'Jika isTruncated bernilai true, jangan menganggap daftar tersebut berisi seluruh riwayat.',
    );
  });

  it('should include evaluation interpretation rules', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain(
      'Untuk hasil evaluasi, gunakan evaluationStatus dan evaluation.',
    );
  });
});
