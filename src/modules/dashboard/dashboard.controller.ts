import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { DashboardService } from './dashboard.service';

import { GetDashboardSummaryQueryDto } from './dto/get-dashboard-summary-query.dto';
import { DashboardSummaryResponseDto } from './dto/dashboard-summary-response.dto';
import { DashboardIncomeAnalyticsResponseDto } from './dto/dashboard-income-analytics-response.dto';
import { DashboardExpenseAnalyticsResponseDto } from './dto/dashboard-expense-analytics-response.dto';
import { GetDashboardCategoryAnalyticsQueryDto } from './dto/get-dashboard-category-analytics-query.dto';
import { DashboardCategoryAnalyticsResponseDto } from './dto/dashboard-category-analytics-response.dto';

@Controller('dashboard')
@ApiTags('Dashboard')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('architecture')
  @ApiOperation({
    summary: 'Get dashboard architecture information',
  })
  @ApiOkResponse({
    description: 'Dashboard architecture information retrieved successfully.',
  })
  getArchitecture(@CurrentUser('id') userId: string) {
    return {
      userId,
      ...this.dashboardService.getArchitecture(),
    };
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Get financial summary',
  })
  @ApiOkResponse({
    type: DashboardSummaryResponseDto,
    description: 'Financial summary retrieved successfully.',
  })
  async getSummary(
    @CurrentUser('id') userId: string,
    @Query() query: GetDashboardSummaryQueryDto,
  ): Promise<DashboardSummaryResponseDto> {
    return this.dashboardService.getFinancialSummary(userId, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get('income')
  @ApiOperation({
    summary: 'Get income analytics',
  })
  @ApiOkResponse({
    type: DashboardIncomeAnalyticsResponseDto,
    description: 'Income analytics retrieved successfully.',
  })
  async getIncomeAnalytics(
    @CurrentUser('id') userId: string,
    @Query() query: GetDashboardSummaryQueryDto,
  ): Promise<DashboardIncomeAnalyticsResponseDto> {
    return this.dashboardService.getIncomeAnalytics(userId, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get('expense')
  @ApiOperation({
    summary: 'Get expense analytics',
  })
  @ApiOkResponse({
    type: DashboardExpenseAnalyticsResponseDto,
    description: 'Expense analytics retrieved successfully.',
  })
  async getExpenseAnalytics(
    @CurrentUser('id') userId: string,
    @Query() query: GetDashboardSummaryQueryDto,
  ): Promise<DashboardExpenseAnalyticsResponseDto> {
    return this.dashboardService.getExpenseAnalytics(userId, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get('categories')
  @ApiOperation({
    summary: 'Get category analytics',
  })
  @ApiOkResponse({
    type: DashboardCategoryAnalyticsResponseDto,
    description: 'Category analytics retrieved successfully.',
  })
  async getCategoryAnalytics(
    @CurrentUser('id') userId: string,
    @Query()
    query: GetDashboardCategoryAnalyticsQueryDto,
  ): Promise<DashboardCategoryAnalyticsResponseDto> {
    const type = String(query.type) === 'INCOME' ? 'INCOME' : 'EXPENSE';

    return this.dashboardService.getCategoryAnalytics(userId, type, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }
}
