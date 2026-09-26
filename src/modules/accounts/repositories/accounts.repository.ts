import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

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
