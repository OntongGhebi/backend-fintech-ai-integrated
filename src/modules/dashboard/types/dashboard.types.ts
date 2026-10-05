export interface DashboardDateRange {
  startDate: Date;
  endDate: Date;
}

export interface DashboardQueryOptions {
  startDate?: Date;
  endDate?: Date;
}

export interface DashboardSummary {
  currency: string;
  totalIncome: string;
  totalExpense: string;
  netCashFlow: string;
  transactionCount: number;
}

export interface DashboardIncomeAnalytics {
  currency: string;
  totalIncome: string;
  transactionCount: number;
  averageIncome: string;
}

export interface DashboardExpenseAnalytics {
  currency: string;
  totalExpense: string;
  transactionCount: number;
  averageExpense: string;
}

export interface DashboardCategoryAnalyticsItem {
  categoryId: string;
  categoryName: string;
  totalAmount: string;
  transactionCount: number;
  percentage: string;
}

export interface DashboardCategoryAnalytics {
  currency: string;
  type: 'INCOME' | 'EXPENSE';
  categories: DashboardCategoryAnalyticsItem[];
  totalAmount: string;
  transactionCount: number;
}

export interface DashboardMetric {
  value: number;
  currency: string;
}

export interface DashboardArchitecture {
  module: 'dashboard';
  sourceOfTruth: 'transactions';
  currency: 'IDR';
  supportsDateRange: true;
}
