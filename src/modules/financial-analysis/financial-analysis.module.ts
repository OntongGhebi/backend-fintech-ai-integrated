import { Module } from '@nestjs/common';

import { DashboardModule } from '../dashboard/dashboard.module';

import { FinancialAnalysisController } from './financial-analysis.controller';
import { FinancialAnalysisService } from './financial-analysis.service';

@Module({
  imports: [DashboardModule],
  controllers: [FinancialAnalysisController],
  providers: [FinancialAnalysisService],
  exports: [FinancialAnalysisService],
})
export class FinancialAnalysisModule {}
