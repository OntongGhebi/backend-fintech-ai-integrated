import { BadRequestException, Injectable } from '@nestjs/common';
import { DASHBOARD_DEFAULT_CURRENCY } from './dashboard.constants';
import {
  DashboardArchitecture,
  DashboardQueryOptions,
  DashboardSummary,
} from './types/dashboard.types';
import { DashboardRepository } from './repositories/dashboard.repository';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  getArchitecture(): DashboardArchitecture {
    return {
      module: 'dashboard',
      sourceOfTruth: 'transactions',
      currency: DASHBOARD_DEFAULT_CURRENCY,
      supportsDateRange: true,
    };
  }

  normalizeQuery(options: DashboardQueryOptions = {}): DashboardQueryOptions {
    if (
      options.startDate &&
      options.endDate &&
      options.startDate > options.endDate
    ) {
      throw new BadRequestException(
        'startDate must be earlier than or equal to endDate',
      );
    }

    return {
      startDate: options.startDate,
      endDate: options.endDate,
      currency:
        options.currency?.trim().toUpperCase() || DASHBOARD_DEFAULT_CURRENCY,
    };
  }

  async getFinancialSummary(
    userId: string,
    options: DashboardQueryOptions = {},
  ): Promise<DashboardSummary> {
    const normalizedOptions = this.normalizeQuery(options);

    const result = await this.dashboardRepository.getFinancialSummary(
      userId,
      normalizedOptions,
    );

    let totalIncome = new Prisma.Decimal(0);
    let totalExpense = new Prisma.Decimal(0);

    for (const transaction of result.groupedTransactions) {
      const amount = transaction._sum.amount ?? new Prisma.Decimal(0);

      if (transaction.type === 'INCOME') {
        totalIncome = totalIncome.plus(amount);
      }
      if (transaction.type === 'EXPENSE') {
        totalExpense = totalExpense.plus(amount);
      }
    }

    const netCashFlow = totalIncome.minus(totalExpense);

    return {
      currency: DASHBOARD_DEFAULT_CURRENCY,
      totalIncome: totalIncome.toString(),
      totalExpense: totalExpense.toString(),
      netCashFlow: netCashFlow.toString(),
      transactionCount: result.transactionCount,
    };
  }
}
