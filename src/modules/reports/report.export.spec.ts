import { buildFinancialReportCsv } from './report.export';

describe('buildFinancialReportCsv', () => {
  it('should generate CSV headers', () => {
    const result = buildFinancialReportCsv([]);

    expect(result).toBe(
      [
        'Transaction ID',
        'Transaction Date',
        'Type',
        'Amount',
        'Currency',
        'Account ID',
        'Category ID',
        'Description',
        'Source',
      ].join(','),
    );
  });

  it('should export transaction data correctly', () => {
    const result = buildFinancialReportCsv([
      {
        id: 'transaction-1',
        accountId: 'account-1',
        categoryId: 'category-1',
        type: 'EXPENSE',
        amount: '150000',
        currency: 'IDR',
        description: 'Lunch',
        transactionDate: new Date('2026-10-08T10:00:00.000Z'),
        source: 'MANUAL',
      },
    ]);

    expect(result).toBe(
      [
        'Transaction ID,Transaction Date,Type,Amount,Currency,Account ID,Category ID,Description,Source',
        'transaction-1,2026-10-08T10:00:00.000Z,EXPENSE,150000,IDR,account-1,category-1,Lunch,MANUAL',
      ].join('\r\n'),
    );
  });

  it('should escape commas, quotes, and new lines', () => {
    const result = buildFinancialReportCsv([
      {
        id: 'transaction-1',
        accountId: 'account-1',
        categoryId: null,
        type: 'EXPENSE',
        amount: '150000',
        currency: 'IDR',
        description: 'Lunch, "special"\nwith friend',
        transactionDate: new Date('2026-10-08T10:00:00.000Z'),
        source: 'MANUAL',
      },
    ]);

    expect(result).toContain('"Lunch, ""special""\nwith friend"');
  });

  it('should protect against CSV formula injection', () => {
    const result = buildFinancialReportCsv([
      {
        id: '=HYPERLINK("http://malicious")',
        accountId: 'account-1',
        categoryId: null,
        type: 'EXPENSE',
        amount: '150000',
        currency: 'IDR',
        description: '=SUM(A1:A2)',
        transactionDate: new Date('2026-10-08T10:00:00.000Z'),
        source: 'MANUAL',
      },
    ]);

    expect(result).toContain(`"'=HYPERLINK(""http://malicious"")"`);

    expect(result).toContain("'=SUM(A1:A2)");
  });

  it('should export nullable values as empty CSV fields', () => {
    const result = buildFinancialReportCsv([
      {
        id: 'transaction-1',
        accountId: 'account-1',
        categoryId: null,
        type: 'INCOME',
        amount: '5000000',
        currency: 'IDR',
        description: null,
        transactionDate: new Date('2026-10-08T10:00:00.000Z'),
        source: 'MANUAL',
      },
    ]);

    expect(result).toContain(
      'transaction-1,2026-10-08T10:00:00.000Z,INCOME,5000000,IDR,account-1,,,' +
        'MANUAL',
    );
  });
});
