import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

@Injectable()
export class BudgetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Parameters<PrismaService['budget']['create']>[0]['data']) {
    return this.prisma.budget.create({ data });
  }

  async findById(budgetId: string) {
    return this.prisma.budget.findUnique({
      where: {
        id: budgetId,
      },
    });
  }

  async findByIdAndUserId(budgetId: string, userId: string) {
    return this.prisma.budget.findFirst({
      where: {
        id: budgetId,
        userId,
        deletedAt: null,
      },
      include: {
        category: true,
      },
    });
  }

  async findManyByUserId(userId: string) {
    return this.prisma.budget.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      include: {
        category: true,
      },
      orderBy: [
        {
          startDate: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async findManyByUserIdAndStatus(
    userId: string,
    status: NonNullable<
      NonNullable<
        NonNullable<Parameters<PrismaService['budget']['findMany']>[0]>['where']
      >['status']
    >,
  ) {
    return this.prisma.budget.findMany({
      where: {
        userId,
        status,
        deletedAt: null,
      },
      include: {
        category: true,
      },
      orderBy: [
        {
          startDate: 'desc',
        },
        { createdAt: 'desc' },
      ],
    });
  }

  async findByNameAndUserId(name: string, userId: string) {
    return this.prisma.budget.findFirst({
      where: {
        userId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });
  }

  async findByNameAndUserIdExceptId(
    name: string,
    userId: string,
    budgetId: string,
  ) {
    return this.prisma.budget.findFirst({
      where: {
        userId,
        id: {
          not: budgetId,
        },
        name: {
          equals: name,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });
  }

  async update(
    budgetId: string,
    userId: string,
    data: Parameters<PrismaService['budget']['updateMany']>[0]['data'],
  ) {
    return this.prisma.budget.updateMany({
      where: {
        id: budgetId,
        userId,
        deletedAt: null,
      },
      data,
    });
  }

  async softDelete(budgetId: string, userId: string) {
    return this.prisma.budget.updateMany({
      where: {
        id: budgetId,
        userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
