export interface DashboardDateRange {
  startDate: Date;
  endDate: Date;
}

export interface DashboardQueryOptions {
  startDate?: Date;
  endDate?: Date;
  currency?: string;
}

export interface DashboardSummary {
  currency: string;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
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
