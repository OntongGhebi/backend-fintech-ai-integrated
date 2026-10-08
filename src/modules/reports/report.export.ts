import type { ReportTransactionItem } from './types/report.types';

const CSV_HEADERS = [
  'Transaction ID',
  'Transaction Date',
  'Type',
  'Amount',
  'Currency',
  'Account ID',
  'Category ID',
  'Description',
  'Source',
] as const;

function sanitizeCsvFormula(value: string): string {
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }

  return value;
}

function escapeCsvValue(value: string | null): string {
  if (value === null) {
    return '';
  }

  const sanitizedValue = sanitizeCsvFormula(value);

  if (
    sanitizedValue.includes(',') ||
    sanitizedValue.includes('"') ||
    sanitizedValue.includes('\n') ||
    sanitizedValue.includes('\r')
  ) {
    return `"${sanitizedValue.replace(/"/g, '""')}"`;
  }

  return sanitizedValue;
}

function transactionToCsvRow(transaction: ReportTransactionItem): string {
  return [
    transaction.id,
    transaction.transactionDate.toISOString(),
    transaction.type,
    transaction.amount,
    transaction.currency,
    transaction.accountId,
    transaction.categoryId,
    transaction.description,
    transaction.source,
  ]
    .map((value) => escapeCsvValue(value === null ? null : String(value)))
    .join(',');
}

export function buildFinancialReportCsv(
  transactions: ReportTransactionItem[],
): string {
  const rows = transactions.map(transactionToCsvRow);

  return [CSV_HEADERS.join(','), ...rows].join('\r\n');
}
