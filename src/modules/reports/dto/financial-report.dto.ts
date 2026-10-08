import { ApiProperty } from '@nestjs/swagger';

import type { FinancialReport } from '../types/report.types';

export class FinancialReportDto {
  @ApiProperty({
    example: 'FINANCIAL',
  })
  reportType!: FinancialReport['reportType'];

  @ApiProperty({
    example: 'IDR',
  })
  currency!: FinancialReport['currency'];

  @ApiProperty({
    example: '2026-01-01T00:00:00.000Z',
  })
  startDate!: string;

  @ApiProperty({
    example: '2026-09-30T23:59:59.999Z',
  })
  endDate!: string;

  @ApiProperty({
    example: '2026-10-08T08:00:00.000Z',
  })
  generatedAt!: Date;

  @ApiProperty({
    type: Object,
    description: 'Financial summary for the selected report period.',
  })
  summary!: FinancialReport['summary'];

  @ApiProperty({
    type: Object,
    description: 'Income analytics for the selected report period.',
  })
  income!: FinancialReport['income'];

  @ApiProperty({
    type: Object,
    description: 'Expense analytics for the selected report period.',
  })
  expense!: FinancialReport['expense'];

  @ApiProperty({
    type: Object,
    description: 'Income and expense analytics grouped by category.',
  })
  categoryAnalytics!: FinancialReport['categoryAnalytics'];

  @ApiProperty({
    type: Object,
    description: 'Income and expense analytics grouped by account.',
  })
  accountAnalytics!: FinancialReport['accountAnalytics'];

  @ApiProperty({
    type: Object,
    description: 'Budget performance for the selected report period.',
  })
  budgetPerformance!: FinancialReport['budgetPerformance'];

  @ApiProperty({
    type: Object,
    description:
      'Recurring transaction performance for the selected report period.',
  })
  recurringPerformance!: FinancialReport['recurringPerformance'];

  @ApiProperty({
    type: Object,
    description: 'Monthly financial summary for the selected report period.',
  })
  monthlyFinancialSummary!: FinancialReport['monthlyFinancialSummary'];

  @ApiProperty({
    type: Object,
    description: 'Cash flow analytics for the selected report period.',
  })
  cashFlow!: FinancialReport['cashFlow'];

  constructor(report: FinancialReport) {
    this.reportType = report.reportType;
    this.currency = report.currency;
    this.startDate = report.startDate;
    this.endDate = report.endDate;
    this.generatedAt = report.generatedAt;

    this.summary = report.summary;
    this.income = report.income;
    this.expense = report.expense;
    this.categoryAnalytics = report.categoryAnalytics;
    this.accountAnalytics = report.accountAnalytics;
    this.budgetPerformance = report.budgetPerformance;
    this.recurringPerformance = report.recurringPerformance;
    this.monthlyFinancialSummary = report.monthlyFinancialSummary;
    this.cashFlow = report.cashFlow;
  }
}
