import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { calculateAccountBalance } from '../account-balance.util';

@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Parameters<PrismaService['account']['create']>[0]['data'],
  ) {
    return this.prisma.account.create({ data });
  }

  async findById(accountId: string) {
    return this.prisma.account.findUnique({
      where: {
        id: accountId,
      },
    });
  }

  async findByIdAndUserId(accountId: string, userId: string) {
    return this.prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
        deletedAt: null,
      },
    });
  }

  async getCurrentBalance(
    accountId: string,
    userId: string,
  ): Promise<string | null> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId, deletedAt: null },
      select: { openingBalance: true },
    });

    if (!account) return null;

    const transactions = await this.prisma.transaction.findMany({
      where: {
        accountId,
        userId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        type: true,
        amount: true,
        metadata: true,
      },
    });

    return calculateAccountBalance(
      account.openingBalance,
      transactions,
    ).toFixed(4);
  }

  async findByNameAndUserId(name: string, userId: string) {
    return this.prisma.account.findFirst({
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

  async findManyByUserId(userId: string) {
    return this.prisma.account.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async update(
    accountId: string,
    userId: string,
    data: Parameters<PrismaService['account']['updateMany']>[0]['data'],
  ) {
    return this.prisma.account.updateMany({
      where: {
        id: accountId,
        userId,
        deletedAt: null,
      },
      data,
    });
  }

  async softDelete(accountId: string, userId: string) {
    return this.prisma.account.updateMany({
      where: {
        id: accountId,
        userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }
}
