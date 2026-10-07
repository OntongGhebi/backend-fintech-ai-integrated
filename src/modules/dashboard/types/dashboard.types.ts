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

export type DashboardRecurringPerformanceStatus =
  'ON_TRACK' | 'NEAR_COMPLETE' | 'UNDERPERFORMING';

export interface DashboardRecurringPerformanceItem {
  recurringTransactionId: string;
  description: string | null;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  amount: string;

  expectedOccurrences: number;
  executedOccurrences: number;
  missedOccurrences: number;

  expectedAmount: string;
  executedAmount: string;

  completionPercentage: string;
  status: DashboardRecurringPerformanceStatus;
}

export interface DashboardRecurringPerformance {
  currency: string;

  recurringTransactions: DashboardRecurringPerformanceItem[];

  totalExpectedAmount: string;
  totalExecutedAmount: string;

  totalExpectedOccurrences: number;
  totalExecutedOccurrences: number;
  totalMissedOccurrences: number;
}

export type DashboardCashFlowPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

export interface DashboardCashFlowItem {
  period: string;
  income: string;
  expense: string;
  netCashFlow: string;
  transactionCount: number;
}

export interface DashboardCashFlow {
  currency: string;
  startDate: string;
  endDate: string;
  period: DashboardCashFlowPeriod;
  cashFlows: DashboardCashFlowItem[];
  totalIncome: string;
  totalExpense: string;
  totalNetCashFlow: string;
  totalTransactionCount: number;
}

export interface DashboardMonthlyFinancialSummaryItem {
  month: string;
  income: string;
  expense: string;
  netCashFlow: string;
  transactionCount: number;
  savingsRate: string;
}

export interface DashboardMonthlyFinancialSummary {
  currency: string;
  startDate: string;
  endDate: string;
  months: DashboardMonthlyFinancialSummaryItem[];
  totalIncome: string;
  totalExpense: string;
  totalNetCashFlow: string;
  totalTransactionCount: number;
  averageMonthlyIncome: string;
  averageMonthlyExpense: string;
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
