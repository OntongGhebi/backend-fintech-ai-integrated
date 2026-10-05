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
}
