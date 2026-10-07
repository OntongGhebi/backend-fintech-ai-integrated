import { ApiProperty } from '@nestjs/swagger';

import { DashboardAccountAnalyticsResponseDto } from './dashboard-account-analytcs-response.dto';
import { DashboardBudgetPerformanceResponseDto } from './dashboard-budget-performance-response.dto';
import { DashboardCashFlowResponseDto } from './dashboard-cash-flow-response.dto';
import { DashboardCategoryAnalyticsResponseDto } from './dashboard-category-analytics-response.dto';
import { DashboardExpenseAnalyticsResponseDto } from './dashboard-expense-analytics-response.dto';
import { DashboardIncomeAnalyticsResponseDto } from './dashboard-income-analytics-response.dto';
import { DashboardMonthlyFinancialSummaryResponseDto } from './dashboard-monthly-financial-summary-response.dto';
import { DashboardRecurringPerformanceResponseDto } from './dashboard-recurring-performance-response.dto';
import { DashboardSummaryResponseDto } from './dashboard-summary-response.dto';

export class DashboardAggregationResponseDto {
  @ApiProperty({ example: 'IDR' })
  currency!: string;

  @ApiProperty({ type: DashboardSummaryResponseDto })
  summary!: DashboardSummaryResponseDto;

  @ApiProperty({ type: DashboardIncomeAnalyticsResponseDto })
  income!: DashboardIncomeAnalyticsResponseDto;

  @ApiProperty({ type: DashboardExpenseAnalyticsResponseDto })
  expense!: DashboardExpenseAnalyticsResponseDto;

  @ApiProperty({ type: DashboardCategoryAnalyticsResponseDto })
  categoryAnalytics!: DashboardCategoryAnalyticsResponseDto;

  @ApiProperty({ type: DashboardAccountAnalyticsResponseDto })
  accountAnalytics!: DashboardAccountAnalyticsResponseDto;

  @ApiProperty({ type: DashboardBudgetPerformanceResponseDto })
  budgetPerformance!: DashboardBudgetPerformanceResponseDto;

  @ApiProperty({ type: DashboardRecurringPerformanceResponseDto })
  recurringPerformance!: DashboardRecurringPerformanceResponseDto;

  @ApiProperty({ type: DashboardMonthlyFinancialSummaryResponseDto })
  monthlyFinancialSummary!: DashboardMonthlyFinancialSummaryResponseDto;

  @ApiProperty({ type: DashboardCashFlowResponseDto })
  cashFlow!: DashboardCashFlowResponseDto;
}
