import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ReportService } from './report.service';
import { ReportRepository } from './repositories/report.repository';
import { ReportController } from './report.controller';

@Module({
  imports: [DashboardModule],
  controllers: [ReportController],
  providers: [ReportRepository, ReportService],
  exports: [ReportService, ReportRepository],
})
export class ReportsModule {}
