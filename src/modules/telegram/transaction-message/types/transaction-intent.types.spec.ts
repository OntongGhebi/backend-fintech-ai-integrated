import { TransactionIntent } from './transaction-intent.types';

describe('TransactionIntent', () => {
  it('should support a create expense transaction intent', () => {
    const intent: TransactionIntent = {
      intent: 'CREATE_TRANSACTION',
      transactionType: 'EXPENSE',
      amount: 25000,
      description: 'makan siang',
      source: 'DETERMINISTIC',
    };

    expect(intent).toEqual({
      intent: 'CREATE_TRANSACTION',
      transactionType: 'EXPENSE',
      amount: 25000,
      description: 'makan siang',
      source: 'DETERMINISTIC',
    });
  });

  it('should support a create income transaction intent', () => {
    const intent: TransactionIntent = {
      intent: 'CREATE_TRANSACTION',
      transactionType: 'INCOME',
      amount: 5000000,
      description: 'gaji',
      source: 'DETERMINISTIC',
    };

    expect(intent).toEqual({
      intent: 'CREATE_TRANSACTION',
      transactionType: 'INCOME',
      amount: 5000000,
      description: 'gaji',
      source: 'DETERMINISTIC',
    });
  });

  it('should support category and account hints', () => {
    const intent: TransactionIntent = {
      intent: 'CREATE_TRANSACTION',
      transactionType: 'EXPENSE',
      amount: 50000,
      description: 'makan malam',
      categoryHint: 'makanan',
      accountHint: 'BCA',
      source: 'AI',
      confidence: 0.94,
    };

    expect(intent.categoryHint).toBe('makanan');

    expect(intent.accountHint).toBe('BCA');

    expect(intent.confidence).toBe(0.94);
  });

  it('should support financial query intent', () => {
    const intent: TransactionIntent = {
      intent: 'QUERY_FINANCIAL_DATA',
      source: 'AI',
      confidence: 0.91,
    };

    expect(intent).toEqual({
      intent: 'QUERY_FINANCIAL_DATA',
      source: 'AI',
      confidence: 0.91,
    });
  });

  it('should support unknown intent', () => {
    const intent: TransactionIntent = {
      intent: 'UNKNOWN',
      source: 'AI',
    };

    expect(intent).toEqual({
      intent: 'UNKNOWN',
      source: 'AI',
    });
  });

  it('should support transaction date', () => {
    const transactionDate = new Date('2026-09-25T12:00:00.000Z');

    const intent: TransactionIntent = {
      intent: 'CREATE_TRANSACTION',
      transactionType: 'EXPENSE',
      amount: 25000,
      description: 'makan siang',
      transactionDate,
      source: 'DETERMINISTIC',
    };

    expect(intent.transactionDate).toEqual(transactionDate);
  });
});
