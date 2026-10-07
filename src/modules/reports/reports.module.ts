import { Module } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service';
import { ReportService } from './report.service';

@Module({
  imports: [DashboardService],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportsModule {}
