import { Module } from '@nestjs/common';

import { AIModule } from '../ai/ai.module';
import { DashboardModule } from '../dashboard/dashboard.module';

import { FinancialAnalysisController } from './financial-analysis.controller';
import { FinancialAnalysisService } from './financial-analysis.service';
import { FinancialInsightsService } from './financial-insights.service';
import { BudgetRecommendationsService } from './budget-recommendations.service';
import { BudgetRecommendationLifecycleService } from './budget-recommendation-lifecycle.service';

@Module({
  imports: [DashboardModule, AIModule],
  controllers: [FinancialAnalysisController],
  providers: [
    FinancialAnalysisService,
    FinancialInsightsService,
    BudgetRecommendationsService,
    BudgetRecommendationLifecycleService,
  ],
  exports: [
    FinancialAnalysisService,
    FinancialInsightsService,
    BudgetRecommendationsService,
    BudgetRecommendationLifecycleService,
  ],
})
export class FinancialAnalysisModule {}
