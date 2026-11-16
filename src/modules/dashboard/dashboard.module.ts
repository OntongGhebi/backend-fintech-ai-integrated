import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './repositories/dashboard.repository';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({
  imports: [BudgetsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
  exports: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
