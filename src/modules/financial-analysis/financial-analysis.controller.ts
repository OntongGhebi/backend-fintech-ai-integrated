import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

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
import { BudgetRecommendationLifecycleService } from './budget-recommendation-lifecycle.service';

import { GetBudgetRecommendationsQueryDto } from './dto/get-budget-recommendations-query.dto';
import { ListBudgetRecommendationsQueryDto } from './dto/list-budget-recommendations-query.dto';
import { RejectBudgetRecommendationDto } from './dto/reject-budget-recommendation.dto';
import { DeferBudgetRecommendationDto } from './dto/defer-budget-recommendation.dto';
import { GetFinancialWellBeingQueryDto } from './dto/get-financial-well-being-query.dto';
import { FinancialWellBeingService } from './financial-well-being.service';

@Controller('financial-analysis')
@ApiTags('Financial Analysis')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class FinancialAnalysisController {
  constructor(
    private readonly financialAnalysisService: FinancialAnalysisService,
    private readonly financialInsightsService: FinancialInsightsService,
    private readonly budgetRecommendationsService: BudgetRecommendationsService,
    private readonly budgetRecommendationLifecycleService: BudgetRecommendationLifecycleService,
    private readonly financialWellBeingService: FinancialWellBeingService,
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

  // ============================================================
  // D.3 — GENERATE BUDGET RECOMMENDATIONS
  // ============================================================

  @Post('budget-recommendations/generate')
  @ApiOperation({
    summary: 'Generate and persist AI-assisted budget recommendations',
    description:
      'Calculates deterministic budget recommendations, adds qualitative AI explanations, and persists recommendation snapshots.',
  })
  @ApiCreatedResponse({
    description: 'Budget recommendations generated and persisted.',
  })
  async generateBudgetRecommendations(
    @CurrentUser('id') userId: string,
    @Query() query: GetBudgetRecommendationsQueryDto,
  ) {
    const result = await this.budgetRecommendationsService.generate(userId, {
      month: query.month,
    });

    return this.budgetRecommendationLifecycleService.persistGenerated(
      userId,
      result,
    );
  }

  // ============================================================
  // D.4 — READ RECOMMENDATIONS
  // ============================================================

  @Get('budget-recommendations')
  @ApiOperation({
    summary: 'List persisted budget recommendations',
  })
  @ApiOkResponse({
    description: 'Persisted budget recommendations retrieved.',
  })
  async getBudgetRecommendations(
    @CurrentUser('id') userId: string,
    @Query() query: ListBudgetRecommendationsQueryDto,
  ) {
    return this.budgetRecommendationLifecycleService.findAll(userId, {
      month: query.month,
      status: query.status,
    });
  }

  @Get('budget-recommendations/:recommendationId')
  @ApiOperation({
    summary: 'Get a persisted budget recommendation',
  })
  @ApiOkResponse({
    description: 'Budget recommendation detail retrieved.',
  })
  async getBudgetRecommendation(
    @CurrentUser('id') userId: string,
    @Param('recommendationId', new ParseUUIDPipe({ version: '4' }))
    recommendationId: string,
  ) {
    return this.budgetRecommendationLifecycleService.findOne(
      userId,
      recommendationId,
    );
  }

  // ============================================================
  // D.4 — ACCEPT
  // ============================================================

  @Patch('budget-recommendations/:recommendationId/accept')
  @ApiOperation({
    summary: 'Accept a budget recommendation',
    description:
      'Accepts a recommendation without immediately modifying the budget allocation.',
  })
  @ApiOkResponse({
    description: 'Budget recommendation accepted.',
  })
  async acceptBudgetRecommendation(
    @CurrentUser('id') userId: string,
    @Param('recommendationId', new ParseUUIDPipe({ version: '4' }))
    recommendationId: string,
  ) {
    return this.budgetRecommendationLifecycleService.accept(
      userId,
      recommendationId,
    );
  }

  // ============================================================
  // D.4 — REJECT
  // ============================================================

  @Patch('budget-recommendations/:recommendationId/reject')
  @ApiOperation({
    summary: 'Reject a budget recommendation',
  })
  @ApiOkResponse({
    description: 'Budget recommendation rejected.',
  })
  async rejectBudgetRecommendation(
    @CurrentUser('id') userId: string,
    @Param('recommendationId', new ParseUUIDPipe({ version: '4' }))
    recommendationId: string,
    @Body() dto?: RejectBudgetRecommendationDto,
  ) {
    return this.budgetRecommendationLifecycleService.reject(
      userId,
      recommendationId,
      dto?.reason,
    );
  }

  // ============================================================
  // D.4 — DEFER
  // ============================================================

  @Patch('budget-recommendations/:recommendationId/defer')
  @ApiOperation({
    summary: 'Defer a budget recommendation',
    description:
      'Defers a pending recommendation until a future timestamp before the target month begins.',
  })
  @ApiOkResponse({
    description: 'Budget recommendation deferred.',
  })
  async deferBudgetRecommendation(
    @CurrentUser('id') userId: string,
    @Param('recommendationId', new ParseUUIDPipe({ version: '4' }))
    recommendationId: string,
    @Body() dto: DeferBudgetRecommendationDto,
  ) {
    return this.budgetRecommendationLifecycleService.defer(
      userId,
      recommendationId,
      dto.deferredUntil,
    );
  }

  // ============================================================
  // D.4 — APPLY
  // ============================================================

  @Post('budget-recommendations/:recommendationId/apply')
  @ApiOperation({
    summary: 'Apply an accepted budget recommendation to its target month',
    description:
      'Applies an accepted INCREASE or DECREASE recommendation to BudgetAllocation in a database transaction.',
  })
  @ApiOkResponse({
    description: 'Recommendation applied to monthly budget allocation.',
  })
  async applyBudgetRecommendation(
    @CurrentUser('id') userId: string,
    @Param('recommendationId', new ParseUUIDPipe({ version: '4' }))
    recommendationId: string,
  ) {
    return this.budgetRecommendationLifecycleService.apply(
      userId,
      recommendationId,
    );
  }

  // ============================================================
  // D.4 — EVALUATE
  // ============================================================

  @Post('budget-recommendations/:recommendationId/evaluate')
  @ApiOperation({
    summary: 'Evaluate an applied recommendation after its target month ends',
    description:
      'Compares actual category spending against the applied monthly allocation and stores the evaluation snapshot.',
  })
  @ApiOkResponse({
    description: 'Budget recommendation evaluation completed.',
  })
  async evaluateBudgetRecommendation(
    @CurrentUser('id') userId: string,
    @Param('recommendationId', new ParseUUIDPipe({ version: '4' }))
    recommendationId: string,
  ) {
    return this.budgetRecommendationLifecycleService.evaluate(
      userId,
      recommendationId,
    );
  }

  @Get('well-being')
  @ApiOperation({
    summary: 'Get financial well-being dashboard',
    description:
      'Combines deterministic financial analysis, budget recommendation lifecycle status, action center items, and data sufficiency indicators for a selected month.',
  })
  @ApiOkResponse({
    description: 'Financial well-being dashboard retrieved successfully.',
  })
  async getWellBeingDashboard(
    @CurrentUser('id') userId: string,
    @Query() query: GetFinancialWellBeingQueryDto,
  ) {
    return this.financialWellBeingService.getDashboard(userId, query.month);
  }
}
