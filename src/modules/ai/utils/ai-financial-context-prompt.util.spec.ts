import {
  buildAIFinancialContextPrompt,
  formatFinancialAmount,
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
});
