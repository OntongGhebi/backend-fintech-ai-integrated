import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { TelegramTransactionConfirmationStatus } from '../../../../generated/prisma/enums';

type ConfirmationMaintenanceClient = {
  telegramTransactionConfirmation: {
    updateMany: (args: {
      where: {
        status: TelegramTransactionConfirmationStatus;
        updatedAt?: { lte: Date };
        expiresAt?: { lte: Date };
      };
      data: {
        status: TelegramTransactionConfirmationStatus;
      };
    }) => Promise<{ count: number }>;
  };
};

@Injectable()
export class TelegramTransactionConfirmationMaintenanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recoverStaleProcessing(staleBefore: Date): Promise<number> {
    const client = this.prisma as unknown as ConfirmationMaintenanceClient;

    const result = await client.telegramTransactionConfirmation.updateMany({
      where: {
        status: TelegramTransactionConfirmationStatus.PROCESSING,
        updatedAt: { lte: staleBefore },
      },
      data: {
        status: TelegramTransactionConfirmationStatus.PENDING,
      },
    });

    return result.count;
  }

  async expirePending(now: Date): Promise<number> {
    const client = this.prisma as unknown as ConfirmationMaintenanceClient;

    const result = await client.telegramTransactionConfirmation.updateMany({
      where: {
        status: TelegramTransactionConfirmationStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: {
        status: TelegramTransactionConfirmationStatus.EXPIRED,
      },
    });

    return result.count;
  }
}
