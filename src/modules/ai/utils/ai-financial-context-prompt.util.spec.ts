import {
  buildAIFinancialContextPrompt,
  formatFinancialAmount,
  type AIFinancialRecommendationPromptItem,
} from './ai-financial-context-prompt.util';

describe('formatFinancialAmount', () => {
  it('should format IDR amounts without changing their magnitude', () => {
    expect(formatFinancialAmount('40000.00', 'IDR')).toBe('Rp40.000');
    expect(formatFinancialAmount('400000.00', 'IDR')).toBe('Rp400.000');
    expect(formatFinancialAmount('1500000.00', 'IDR')).toBe('Rp1.500.000');
  });

  it('should preserve non-zero decimal values', () => {
    expect(formatFinancialAmount('40000.50', 'IDR')).toBe('Rp40.000,50');
  });

  it('should format negative values', () => {
    expect(formatFinancialAmount('-40000.00', 'IDR')).toBe('-Rp40.000');
  });

  it('should not use floating-point conversion for large values', () => {
    expect(formatFinancialAmount('9007199254740993.00', 'IDR')).toBe(
      'Rp9.007.199.254.740.993',
    );
  });

  it('should retain the original value when the input is invalid', () => {
    expect(formatFinancialAmount('invalid-value', 'IDR')).toBe(
      'IDR invalid-value',
    );
  });

  it('should format non-IDR currencies', () => {
    expect(formatFinancialAmount('1250.50', 'USD')).toBe('USD 1.250.50');
  });
});

describe('buildAIFinancialContextPrompt', () => {
  const context = {
    currency: 'IDR',

    summary: {
      income: '5000000.00',
      expense: '40000.00',
      balance: '4960000.00',
      incomeCount: 1,
      expenseCount: 1,
    },

    expensesByCategory: [
      {
        category: 'Food',
        amount: '40000.00',
      },
    ],

    recentTransactions: [
      {
        id: 'transaction-1',
        type: 'EXPENSE',
        amount: '40000.00',
        currency: 'IDR',
        description: 'Lunch in Food Truck',
        transactionDate: new Date('2026-11-01T05:00:00.000Z'),
        category: 'Food',
        account: 'BCA Main Account',
      },
    ],

    budgets: [
      {
        id: 'budget-1',
        name: 'Food Budget',
        currency: 'IDR',
        limit: '1500000.00',
        spent: '40000.00',
        remaining: '1460000.00',
        usagePercentage: 2.66,
        period: 'MONTHLY',
        periodStart: new Date('2026-11-01T00:00:00.000Z'),
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-11-30T23:59:59.999Z'),
      },
    ],
  };

  const createRecommendation = (
    budgetScope: AIFinancialRecommendationPromptItem['budgetScope'],
    overrides: Partial<AIFinancialRecommendationPromptItem> = {},
  ): AIFinancialRecommendationPromptItem => ({
    id: 'recommendation-1',
    budgetId: 'budget-1',
    budgetName: 'Food Budget',
    category: 'Food',
    budgetScope,
    targetMonth: '2026-12',
    currentAllocation: '150000.00',
    proposedAllocation: '200000.00',
    changeAmount: '50000.00',
    changePercentage: '33.33',
    action: 'INCREASE',
    status: 'PENDING',
    reason: 'Pengeluaran aktual membutuhkan penyesuaian alokasi.',
    guardrails: ['MAX_ALLOCATION_LIMIT'],
    aiExplanation: 'Penyesuaian berdasarkan riwayat pengeluaran.',
    deferredUntil: null,
    rejectionReason: null,
    appliedAt: null,
    evaluatedAt: null,
    evaluationStatus: null,
    evaluation: null,
    createdAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  });

  const createContextWithRecommendation = (
    recommendation: AIFinancialRecommendationPromptItem,
  ) => ({
    ...context,
    financialWellBeing: {
      generatedAt: '2026-11-18T10:00:00.000Z',
      recommendationSummary: {
        total: 1,
        byStatus: {
          PENDING: 1,
          ACCEPTED: 0,
          REJECTED: 0,
          DEFERRED: 0,
          APPLIED: 0,
          EVALUATED: 0,
        },
        returnedRecommendationCount: 1,
        isTruncated: false,
      },
      actionCenter: [recommendation],
      recentRecommendations: [recommendation],
    },
  });

  it('should include the original financial context JSON', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain(JSON.stringify(context));
  });

  it('should include the exact display value for a Rp40.000 transaction', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain('"amount":"40000.00"');
    expect(prompt).toContain('"amountDisplay":"Rp40.000"');
  });

  it('should include the exact monthly budget facts', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain('"limitDisplay":"Rp1.500.000"');
    expect(prompt).toContain('"spentDisplay":"Rp40.000"');
    expect(prompt).toContain('"remainingDisplay":"Rp1.460.000"');
    expect(prompt).toContain('"usagePercentage":2.66');
  });

  it('should explicitly explain the difference between Rp40.000 and Rp400.000', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain('"40000.00" berarti Rp40.000, bukan Rp400.000.');
    expect(prompt).toContain('"400000.00" berarti Rp400.000.');
  });

  it('should instruct the model not to recalculate backend budget metrics', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain(
      'Nilai usagePercentage pada data budget sudah dihitung backend.',
    );
    expect(prompt).toContain(
      'Jangan mengganti nilai faktual dengan perkiraan atau hasil perhitungan model.',
    );
  });

  it('should explain ALL_EXPENSES includes uncategorized transactions', () => {
    const recommendation = createRecommendation({
      type: 'ALL_EXPENSES',
      categoryNames: [],
      includesUncategorized: true,
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"type":"ALL_EXPENSES"');
    expect(prompt).toContain('"includesUncategorized":true');
    expect(prompt).toContain(
      'ALL_EXPENSES mencakup seluruh transaksi pengeluaran, termasuk transaksi yang tidak memiliki kategori.',
    );
  });

  it('should explain CATEGORY only includes its explicitly resolved category', () => {
    const recommendation = createRecommendation({
      type: 'CATEGORY',
      categoryNames: ['Food'],
      includesUncategorized: false,
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"type":"CATEGORY"');
    expect(prompt).toContain('"categoryNames":["Food"]');
    expect(prompt).toContain(
      'CATEGORY hanya mencakup kategori yang tercantum pada budgetScope.categoryNames.',
    );
  });

  it('should explain CATEGORY_GROUP includes root and nested categories', () => {
    const recommendation = createRecommendation({
      type: 'CATEGORY_GROUP',
      categoryNames: ['Food', 'Groceries', 'Restaurants', 'Drinks'],
      includesUncategorized: false,
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"type":"CATEGORY_GROUP"');
    expect(prompt).toContain(
      '"categoryNames":["Food","Groceries","Restaurants","Drinks"]',
    );
    expect(prompt).toContain(
      'CATEGORY_GROUP mencakup kategori root dan seluruh kategori turunannya, termasuk kategori pada tingkat child maupun grandchild yang tercantum pada categoryNames.',
    );
  });

  it('should explain CUSTOM only includes explicitly configured categories', () => {
    const recommendation = createRecommendation({
      type: 'CUSTOM',
      categoryNames: ['Food', 'Transportation'],
      includesUncategorized: false,
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"type":"CUSTOM"');
    expect(prompt).toContain('"categoryNames":["Food","Transportation"]');
    expect(prompt).toContain(
      'CUSTOM hanya mencakup kategori yang secara eksplisit tercantum pada budgetScope.categoryNames.',
    );
  });

  it('should not infer scope categories when budgetScope is unavailable', () => {
    const recommendation = createRecommendation(undefined);
    delete recommendation.budgetScope;

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain(
      'Jika budgetScope tidak tersedia pada suatu rekomendasi, nyatakan bahwa detail cakupan kategorinya tidak tersedia.',
    );
  });

  it('should preserve recommendation amount display values with budget scope', () => {
    const recommendation = createRecommendation({
      type: 'CATEGORY_GROUP',
      categoryNames: ['Food', 'Groceries'],
      includesUncategorized: false,
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"currentAllocation":"150000.00"');
    expect(prompt).toContain('"currentAllocationDisplay":"Rp150.000"');
    expect(prompt).toContain('"proposedAllocation":"200000.00"');
    expect(prompt).toContain('"proposedAllocationDisplay":"Rp200.000"');
    expect(prompt).toContain('"changeAmountDisplay":"Rp50.000"');
    expect(prompt).toContain('"allocationChangeState":"INCREASED"');
  });

  it('should identify MAINTAIN recommendations with unchanged allocations', () => {
    const recommendation = createRecommendation(undefined, {
      currentAllocation: '150000.00',
      proposedAllocation: '150000.00',
      changeAmount: '0.00',
      changePercentage: '0.00',
      action: 'MAINTAIN',
      reason: 'Alokasi saat ini masih sesuai dengan kebutuhan pengeluaran.',
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"action":"MAINTAIN"');
    expect(prompt).toContain('"currentAllocation":"150000.00"');
    expect(prompt).toContain('"proposedAllocation":"150000.00"');
    expect(prompt).toContain('"changeAmount":"0.00"');
    expect(prompt).toContain('"allocationChangeState":"UNCHANGED"');
    expect(prompt).toContain(
      'Untuk action MAINTAIN dengan allocationChangeState UNCHANGED, jelaskan bahwa alokasi dipertahankan pada nominal yang sama.',
    );
    expect(prompt).toContain(
      'Untuk MAINTAIN dengan nominal yang sama, sampaikan secara eksplisit bahwa alokasi tetap dan jelaskan alasannya berdasarkan data backend.',
    );
  });

  it('should identify unchanged allocations for large monetary values precisely', () => {
    const recommendation = createRecommendation(undefined, {
      currentAllocation: '9007199254740993.00',
      proposedAllocation: '9007199254740993.00',
      changeAmount: '0.00',
      changePercentage: '0.00',
      action: 'MAINTAIN',
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"allocationChangeState":"UNCHANGED"');
  });

  it('should identify a one-cent allocation increase precisely', () => {
    const recommendation = createRecommendation(undefined, {
      currentAllocation: '150000.00',
      proposedAllocation: '150000.01',
      changeAmount: '0.01',
      changePercentage: '0.00',
      action: 'INCREASE',
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"allocationChangeState":"INCREASED"');
  });

  it('should flag inconsistent MAINTAIN action when allocations differ', () => {
    const recommendation = createRecommendation(undefined, {
      currentAllocation: '150000.00',
      proposedAllocation: '200000.00',
      changeAmount: '50000.00',
      action: 'MAINTAIN',
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"action":"MAINTAIN"');
    expect(prompt).toContain('"allocationChangeState":"INCREASED"');
    expect(prompt).toContain(
      'Jika action MAINTAIN tetapi allocationChangeState bukan UNCHANGED, jangan menyatakan bahwa nominalnya sama.',
    );
  });

  it('should identify decreased allocations precisely', () => {
    const recommendation = createRecommendation(undefined, {
      currentAllocation: '200000.00',
      proposedAllocation: '150000.00',
      changeAmount: '-50000.00',
      action: 'DECREASE',
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"allocationChangeState":"DECREASED"');
  });

  it('should mark allocation comparison unavailable when an amount is missing', () => {
    const recommendation = createRecommendation(undefined, {
      currentAllocation: null,
      proposedAllocation: '150000.00',
      action: 'MAINTAIN',
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"allocationChangeState":"UNAVAILABLE"');
    expect(prompt).toContain(
      'Jika allocationChangeState UNAVAILABLE, jangan menyimpulkan apakah alokasi berubah atau tetap.',
    );
  });

  it('should mark allocation comparison unavailable when an amount is invalid', () => {
    const recommendation = createRecommendation(undefined, {
      currentAllocation: 'invalid',
      proposedAllocation: '150000.00',
      action: 'MAINTAIN',
    });

    const prompt = buildAIFinancialContextPrompt(
      createContextWithRecommendation(recommendation),
    );

    expect(prompt).toContain('"allocationChangeState":"UNAVAILABLE"');
  });

  it('should warn against double-counting overlapping budget scopes', () => {
    const prompt = buildAIFinancialContextPrompt(context);

    expect(prompt).toContain(
      'Jangan menjumlahkan pengeluaran keduanya sebagai pengeluaran unik tanpa memastikan tidak ada transaksi yang dihitung ganda.',
    );
  });
});
