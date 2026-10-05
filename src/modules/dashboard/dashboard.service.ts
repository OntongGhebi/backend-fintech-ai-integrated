import { Injectable } from '@nestjs/common';
import { DASHBOARD_DEFAULT_CURRENCY } from './dashboard.constants';
import {
  DashboardArchitecture,
  DashboardQueryOptions,
} from './types/dashboard.types';

@Injectable()
export class DashboardService {
  getArchitecture(): DashboardArchitecture {
    return {
      module: 'dashboard',
      sourceOfTruth: 'transactions',
      currency: DASHBOARD_DEFAULT_CURRENCY,
      supportsDateRange: true,
    };
  }

  normalizeQuery(options: DashboardQueryOptions = {}): DashboardQueryOptions {
    return {
      startDate: options.startDate,
      endDate: options.endDate,
      currency:
        options.currency?.trim().toUpperCase() || DASHBOARD_DEFAULT_CURRENCY,
    };
  }
}
