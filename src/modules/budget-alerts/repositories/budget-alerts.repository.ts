import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma/prisma.service';

@Injectable()
export class BudgetAlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Parameters<PrismaService['budgetAlert']['create']>[0]['data'],
  ) {
    return this.prisma.budgetAlert.create({
      data,
      include: {
        budget: true,
      },
    });
  }

  async findById(budgetAlertId: string) {
    return this.prisma.budgetAlert.findUnique({
      where: {
        id: budgetAlertId,
      },
      include: {
        budget: true,
      },
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
      include: {
        budget: true,
      },
    });
  }

  async findManyByBudgetIdAndUserId(budgetId: string, userId: string) {
    return this.prisma.budgetAlert.findMany({
      where: {
        budgetId,
        budget: {
          userId,
          deletedAt: null,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        budget: true,
      },
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
}
