import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { GetDashboardSummaryQueryDto } from '../dashboard/dto/get-dashboard-summary-query.dto';

import { FinancialAnalysisService } from './financial-analysis.service';
import { FinancialInsightsService } from './financial-insights.service';
import { BudgetRecommendationsService } from './budget-recommendations.service';

import { GetBudgetRecommendationsQueryDto } from './dto/get-budget-recommendations-query.dto';

@Controller('financial-analysis')
@ApiTags('Financial Analysis')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class FinancialAnalysisController {
  constructor(
    private readonly financialAnalysisService: FinancialAnalysisService,
    private readonly financialInsightsService: FinancialInsightsService,
    private readonly budgetRecommendationsService: BudgetRecommendationsService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get deterministic financial analysis overview',
    description:
      'Returns backend-calculated financial metrics, spending patterns, monthly trends, budget health, and financial signals.',
  })
  @ApiOkResponse({
    description: 'Financial analysis overview retrieved successfully.',
  })
  async getOverview(
    @CurrentUser('id') userId: string,
    @Query() query: GetDashboardSummaryQueryDto,
  ) {
    return this.financialAnalysisService.getOverview(userId, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Post('insights/generate')
  @ApiOperation({
    summary: 'Generate AI financial insights',
    description:
      'Generates qualitative financial insights from deterministic backend analysis. Financial evidence is attached from backend-calculated metrics.',
  })
  @ApiOkResponse({
    description:
      'AI financial insights generated or an availability status returned.',
  })
  async generateInsights(
    @CurrentUser('id') userId: string,
    @Query() query: GetDashboardSummaryQueryDto,
  ) {
    return this.financialInsightsService.generate(userId, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Post('budget-recommendations/generate')
  @ApiOperation({
    summary: 'Generate AI-assisted budget recommendations',
    description:
      'Generates deterministic monthly budget recommendations using historical financial data. AI only provides qualitative explanations and cannot modify recommendation amounts or budget allocations.',
  })
  @ApiCreatedResponse({
    description:
      'Budget recommendations generated or no eligible recommendations were found.',
  })
  async generateBudgetRecommendations(
    @CurrentUser('id') userId: string,
    @Query() query: GetBudgetRecommendationsQueryDto,
  ) {
    return this.budgetRecommendationsService.generate(userId, {
      month: query.month,
    });
  }
}
