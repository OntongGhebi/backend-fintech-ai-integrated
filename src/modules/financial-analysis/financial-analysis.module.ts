import { Module } from '@nestjs/common';

import { AIModule } from '../ai/ai.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { DashboardModule } from '../dashboard/dashboard.module';

import { FinancialAnalysisController } from './financial-analysis.controller';
import { FinancialAnalysisService } from './financial-analysis.service';
import { FinancialInsightsService } from './financial-insights.service';
import { BudgetRecommendationsService } from './budget-recommendations.service';
import { BudgetRecommendationLifecycleService } from './budget-recommendation-lifecycle.service';
import { FinancialWellBeingService } from './financial-well-being.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BudgetRecommendationNotificationService } from './budget-recommendation-notification.service';

@Module({
  imports: [DashboardModule, AIModule, BudgetsModule, NotificationsModule],
  controllers: [FinancialAnalysisController],
  providers: [
    FinancialAnalysisService,
    FinancialInsightsService,
    BudgetRecommendationsService,
    BudgetRecommendationLifecycleService,
    BudgetRecommendationNotificationService,
    FinancialWellBeingService,
  ],
  exports: [
    FinancialAnalysisService,
    FinancialInsightsService,
    BudgetRecommendationsService,
    BudgetRecommendationLifecycleService,
    BudgetRecommendationNotificationService,
    FinancialWellBeingService,
  ],
})
export class FinancialAnalysisModule {}
