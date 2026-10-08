import { Injectable } from '@nestjs/common';

import {
  REPORT_DEFAULT_CURRENCY,
  REPORT_DEFAULT_TYPE,
} from './report.constants';

import { FinancialReportDto } from './dto/financial-report.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportRepository } from './repositories/report.repository';
import type { FinancialReport, ReportQueryOptions } from './types/report.types';

@Injectable()
export class ReportService {
  constructor(private readonly reportRepository: ReportRepository) {}

  async getFinancialReport(
    userId: string,
    options: ReportQueryOptions = {},
  ): Promise<FinancialReport> {
    const reportData = await this.reportRepository.getFinancialReportData(
      userId,
      options,
    );

    return {
      reportType: REPORT_DEFAULT_TYPE,
      currency: REPORT_DEFAULT_CURRENCY,
      startDate: reportData.monthlyFinancialSummary.startDate,
      endDate: reportData.monthlyFinancialSummary.endDate,
      generatedAt: new Date(),

      summary: reportData.summary,
      income: reportData.income,
      expense: reportData.expense,
      categoryAnalytics: reportData.categoryAnalytics,
      accountAnalytics: reportData.accountAnalytics,
      budgetPerformance: reportData.budgetPerformance,
      recurringPerformance: reportData.recurringPerformance,
      monthlyFinancialSummary: reportData.monthlyFinancialSummary,
      cashFlow: reportData.cashFlow,
    };
  }

  async getFinancialReportDto(
    userId: string,
    options: ReportQueryOptions = {},
  ): Promise<FinancialReportDto> {
    const report = await this.getFinancialReport(userId, options);

    return new FinancialReportDto(report);
  }

  buildQueryOptions(query: ReportQueryDto): ReportQueryOptions {
    return {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      type: query.type,
      accountId: query.accountId,
      categoryId: query.categoryId,
    };
  }
}
