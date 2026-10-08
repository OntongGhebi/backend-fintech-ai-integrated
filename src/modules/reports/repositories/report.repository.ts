import { Injectable } from '@nestjs/common';
import { DashboardService } from 'src/modules/dashboard/dashboard.service';

import type {
  DashboardAggregation,
  DashboardQueryOptions,
} from 'src/modules/dashboard/types/dashboard.types';

@Injectable()
export class ReportRepository {
  constructor(private readonly dashboardService: DashboardService) {}

  async getFinancialReportData(
    userId: string,
    options: DashboardQueryOptions,
  ): Promise<DashboardAggregation> {
    return this.dashboardService.getDashboardAggregation(userId, options);
  }
}
