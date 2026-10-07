import type {
  DashboardAggregation,
  DashboardQueryOptions,
} from 'src/modules/dashboard/types/dashboard.types';

export interface ReportQueryOptions extends DashboardQueryOptions {}

export type FinancialReportType = 'FINANCIAL';

export interface FinancialReport extends DashboardAggregation {
  reportType: FinancialReportType;
  startDate: string;
  endDate: string;
  generatedAt: Date;
}
