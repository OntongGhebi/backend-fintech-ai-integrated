import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { GetBudgetAlertsQueryDto } from '../dto/get-budget-alerts-query.dto';
import { getBudgetMonthRange } from '../../budgets/utils/budget-month.util';

@Injectable()
export class BudgetAlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Parameters<PrismaService['budgetAlert']['create']>[0]['data'],
  ) {
    return this.prisma.budgetAlert.create({
      data,
      include: this.budgetWithCurrentAllocationInclude(),
    });
  }

  async findById(budgetAlertId: string) {
    return this.prisma.budgetAlert.findUnique({
      where: {
        id: budgetAlertId,
      },
      include: this.budgetWithCurrentAllocationInclude(),
    });
  }

  async findByIdAndUserId(budgetAlertId: string, userId: string) {
    return this.prisma.budgetAlert.findFirst({
      where: {
        id: budgetAlertId,
        budget: {
          userId,
          deletedAt: null,
        },
      },
      include: this.budgetWithCurrentAllocationInclude(),
    });
  }

  async findManyByBudgetIdAndUserId(
    budgetId: string,
    userId: string,
    query: GetBudgetAlertsQueryDto,
  ) {
    return this.prisma.budgetAlert.findMany({
      where: {
        budgetId,
        budget: {
          userId,
          deletedAt: null,
        },
        ...(query.channel !== undefined
          ? {
              channel: query.channel,
            }
          : {}),
        ...(query.isEnabled !== undefined
          ? {
              isEnabled: query.isEnabled,
            }
          : {}),
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: this.budgetWithCurrentAllocationInclude(),
    });
  }

  async findManyByUserId(userId: string, query: GetBudgetAlertsQueryDto) {
    return this.prisma.budgetAlert.findMany({
      where: {
        budget: {
          userId,
          deletedAt: null,
        },
        ...(query.channel !== undefined
          ? {
              channel: query.channel,
            }
          : {}),
        ...(query.isEnabled !== undefined
          ? {
              isEnabled: query.isEnabled,
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: this.budgetWithCurrentAllocationInclude(),
    });
  }

  async update(
    budgetAlertId: string,
    userId: string,
    data: Parameters<PrismaService['budgetAlert']['updateMany']>[0]['data'],
  ) {
    return this.prisma.budgetAlert.updateMany({
      where: {
        id: budgetAlertId,
        budget: {
          userId,
          deletedAt: null,
        },
      },
      data,
    });
  }

  async delete(budgetAlertId: string, userId: string) {
    return this.prisma.budgetAlert.deleteMany({
      where: {
        id: budgetAlertId,
        budget: {
          userId,
          deletedAt: null,
        },
      },
    });
  }

  /**
   * Preserve the budget relation while exposing the selected month's
   * allocation to API consumers. Budget.amount is a legacy snapshot.
   */
  private budgetWithCurrentAllocationInclude() {
    const month = getBudgetMonthRange(new Date(), 'Asia/Jakarta');
    return {
      budget: {
        include: {
          allocations: {
            where: { periodStart: month.periodStart },
            take: 1,
          },
        },
      },
    } as const;
  }
}
