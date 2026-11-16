import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { CategoriesModule } from '../categories/categories.module';
import { BudgetsRepository } from './repositories/budgets.repository';
import { BudgetScopeEngine } from './budget-scope.engine';

@Module({
  imports: [CategoriesModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetsRepository, BudgetScopeEngine],
  exports: [BudgetsService, BudgetsRepository, BudgetScopeEngine],
})
export class BudgetsModule {}
