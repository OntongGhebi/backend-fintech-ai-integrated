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

export interface DashboardAccountAnalyticsItem {
  accountId: string;
  accountName: string;
  totalAmount: string;
  transactionCount: number;
  percentage: string;
}

export interface DashboardAccountAnalytics {
  currency: string;
  type: 'INCOME' | 'EXPENSE';
  accounts: DashboardAccountAnalyticsItem[];
  totalAmount: string;
  transactionCount: number;
}

export type DashboardBudgetPerformanceStatus =
  'ON_TRACK' | 'NEAR_LIMIT' | 'OVER_BUDGET';

export interface DashboardBudgetPerformanceItem {
  budgetId: string;
  budgetName: string;
  categoryId: string;
  categoryName: string;
  budgetAmount: string;
  actualAmount: string;
  remainingAmount: string;
  usagePercentage: string;
  transactionCount: number;
  status: DashboardBudgetPerformanceStatus;
}

export interface DashboardBudgetPerformance {
  currency: string;
  budgets: DashboardBudgetPerformanceItem[];
  totalBudgetAmount: string;
  totalActualAmount: string;
  totalRemainingAmount: string;
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
