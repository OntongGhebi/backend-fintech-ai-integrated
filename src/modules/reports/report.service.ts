import { Injectable } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service';
import {
  REPORT_DEFAULT_CURRENCY,
  REPORT_DEFAULT_TYPE,
} from './report.constants';
import { FinancialReport, ReportQueryOptions } from './types/report.types';

@Injectable()
export class ReportService {
  constructor(private readonly dashboardService: DashboardService) {}

  async getFinancialReport(
    userId: string,
    options: ReportQueryOptions = {},
  ): Promise<FinancialReport> {
    const dashboard = await this.dashboardService.getDashboardAggregation(
      userId,
      options,
    );

    return {
      reportType: REPORT_DEFAULT_TYPE,
      currency: REPORT_DEFAULT_CURRENCY,
      startDate: dashboard.monthlyFinancialSummary.startDate,
      endDate: dashboard.monthlyFinancialSummary.endDate,
      generatedAt: new Date(),
      summary: dashboard.summary,
      income: dashboard.income,
      expense: dashboard.expense,
      categoryAnalytics: dashboard.categoryAnalytics,
      accountAnalytics: dashboard.accountAnalytics,
      budgetPerformance: dashboard.budgetPerformance,
      recurringPerformance: dashboard.recurringPerformance,
      monthlyFinancialSummary: dashboard.monthlyFinancialSummary,
      cashFlow: dashboard.cashFlow,
    };
  }
}
