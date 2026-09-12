import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { GetTransactionsQueryDto } from '../dto/get-transaction-query.dto';

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Parameters<PrismaService['transaction']['create']>[0]['data'],
  ) {
    return this.prisma.transaction.create({
      data,
      include: {
        account: true,
        category: true,
      },
    });
  }

  async findByIdAndUserId(transactionId: string, userId: string) {
    return this.prisma.transaction.findFirst({
      where: {
        id: transactionId,
        userId,
        deletedAt: null,
      },
      include: {
        account: true,
        category: true,
      },
    });
  }

  async findCategoryByIdAndUserId(categoryId: string, userId: string) {
    return this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
        deletedAt: null,
      },
    });
  }

  async findManyByUserId(userId: string, query: GetTransactionsQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = {
      userId,
      deletedAt: null,
      ...(query.type && {
        type: query.type,
      }),
      ...(query.accountId && {
        accountId: query.accountId,
      }),
      ...(query.categoryId && {
        categoryId: query.categoryId,
      }),
      ...(query.status && {
        status: query.status,
      }),
      ...(query.startDate || query.endDate
        ? {
            transactionDate: {
              ...(query.startDate && {
                gte: new Date(query.startDate),
              }),
              ...(query.endDate && {
                lte: new Date(query.endDate),
              }),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          account: true,
          category: true,
        },
        orderBy: [
          {
            transactionDate: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.transaction.count({
        where,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(
    transactionId: string,
    userId: string,
    data: Parameters<PrismaService['transaction']['updateMany']>[0]['data'],
  ) {
    return this.prisma.transaction.updateMany({
      where: {
        id: transactionId,
        userId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      data,
    });
  }

  async voidTransaction(transactionId: string, userId: string) {
    return this.prisma.transaction.updateMany({
      where: {
        id: transactionId,
        userId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      data: {
        status: 'VOIDED',
      },
    });
  }

  async findManyByTransferGroupId(transferGroupId: string, userId: string) {
    return this.prisma.transaction.findMany({
      where: {
        transferGroupId,
        userId,
        deletedAt: null,
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }
}
