import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

@Injectable()
export class TelegramAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTelegramUserId(telegramUserId: bigint) {
    return this.prisma.telegramAccount.findUnique({
      where: {
        telegramUserId,
      },
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.telegramAccount.findMany({
      where: {
        userId,
        isVerified: true,
        unlinkedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async create(data: {
    userId: string;
    telegramUserId: bigint;
    telegramUsername?: string;
    firstName?: string;
    lastName?: string;
  }) {
    return this.prisma.telegramAccount.create({
      data: {
        userId: data.userId,
        telegramUserId: data.telegramUserId,
        telegramUsername: data.telegramUsername,
        firstName: data.firstName,
        lastName: data.lastName,
        isVerified: true,
        linkedAt: new Date(),
      },
    });
  }

  async relink(
    telegramAccountId: string,
    data: {
      userId: string;
      telegramUsername?: string;
      firstName?: string;
      lastName?: string;
    },
  ) {
    return this.prisma.telegramAccount.update({
      where: {
        id: telegramAccountId,
      },
      data: {
        userId: data.userId,
        telegramUsername: data.telegramUsername,
        firstName: data.firstName,
        lastName: data.lastName,
        isVerified: true,
        linkedAt: new Date(),
        unlinkedAt: null,
      },
    });
  }

  async unlink(telegramAccountId: string) {
    return this.prisma.telegramAccount.update({
      where: {
        id: telegramAccountId,
      },
      data: {
        isVerified: true,
        unlinkedAt: new Date(),
      },
    });
  }
}
