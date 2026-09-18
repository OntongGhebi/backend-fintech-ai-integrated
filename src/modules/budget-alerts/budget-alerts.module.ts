import { Module } from '@nestjs/common';
import { BudgetAlertsController } from './budget-alerts.controller';
import { BudgetAlertsService } from './budget-alerts.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { BudgetAlertsRepository } from './repositories/budget-alerts.repository';

@Module({
  imports: [BudgetsModule],
  controllers: [BudgetAlertsController],
  providers: [BudgetAlertsService, BudgetAlertsRepository],
  exports: [BudgetAlertsService, BudgetAlertsRepository],
})
export class BudgetAlertsModule {}
