import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

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

  async findManyByUserId(userId: string) {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
      },
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
    });
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
