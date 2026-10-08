import type {
  DashboardAggregation,
  DashboardQueryOptions,
} from 'src/modules/dashboard/types/dashboard.types';

export interface ReportPaginationOptions {
  page?: number;
  limit?: number;
}

export interface ReportQueryOptions
  extends DashboardQueryOptions, ReportPaginationOptions {}

export type FinancialReportType = 'FINANCIAL';

export interface ReportTransactionItem {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: 'INCOME' | 'EXPENSE';
  amount: string;
  currency: string;
  description: string | null;
  transactionDate: Date;
  source: string;
}

export interface ReportPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedReportTransactions {
  data: ReportTransactionItem[];
  meta: ReportPaginationMeta;
}

export interface FinancialReport extends DashboardAggregation {
  reportType: FinancialReportType;
  startDate: string;
  endDate: string;
  generatedAt: Date;
  transactions: PaginatedReportTransactions;
}
