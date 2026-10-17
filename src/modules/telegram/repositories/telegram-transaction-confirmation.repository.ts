import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { TelegramTransactionConfirmationStatus } from '../../../../generated/prisma/enums';
import { Prisma } from '../../../../generated/prisma/client';

import {
  CreateTransactionConfirmationInput,
  PendingTransactionConfirmation,
  //   TransactionConfirmationStatus,
} from '../transaction-message/types/transaction-confirmation.types';
import { ResolvedTransactionIntent } from '../transaction-message/types/resolved-transaction-intent.types';

type ConfirmationRecord = {
  id: string;
  userId: string;
  chatId: string;
  sourceMessageId: string;
  telegramAccountId: string;
  telegramUserId: bigint;
  intent: Prisma.JsonValue;
  status: TelegramTransactionConfirmationStatus;
  createdAt: Date;
  expiresAt: Date;
  transaction?: { id: string } | null;
};

type ConfirmationUpdateManyArgs = {
  where: {
    id: string;
    status: TelegramTransactionConfirmationStatus;
    expiresAt?: { lte?: Date; gt?: Date };
  };
  data: { status: TelegramTransactionConfirmationStatus };
};

@Injectable()
export class TelegramTransactionConfirmationRepository {
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateTransactionConfirmationInput,
  ): Promise<PendingTransactionConfirmation> {
    const existing = await this.findBySourceMessageId(
      input.chatId,
      input.sourceMessageId,
    );

    if (existing) {
      return existing;
    }

    const now = new Date();

    try {
      const confirmationModel = (
        this.prisma as unknown as {
          telegramTransactionConfirmation: {
            create: (args: {
              data: {
                userId: string;
                telegramAccountId: string;
                chatId: string;
                sourceMessageId: string;
                telegramUserId: bigint;
                intent: Prisma.InputJsonValue;
                status: TelegramTransactionConfirmationStatus;
                expiresAt: Date;
              };
              include: { transaction: { select: { id: true } } };
            }) => Promise<ConfirmationRecord>;
          };
        }
      ).telegramTransactionConfirmation;

      const record = await confirmationModel.create({
        data: {
          userId: input.userId,
          telegramAccountId: input.telegramAccountId,
          chatId: input.chatId,
          sourceMessageId: input.sourceMessageId,
          telegramUserId: input.telegramUserId,
          intent: JSON.parse(
            JSON.stringify(input.intent),
          ) as Prisma.InputJsonValue,
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: new Date(now.getTime() + this.ttlMs),
        },
        include: { transaction: { select: { id: true } } },
      });

      return this.toDomain(record);
    } catch (error) {
      // Concurrent deliveries of the same Telegram message may race to create.
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const duplicate = await this.findBySourceMessageId(
        input.chatId,
        input.sourceMessageId,
      );

      if (duplicate) {
        return duplicate;
      }

      throw error;
    }
  }

  async findById(
    confirmationId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    const confirmationModel = (
      this.prisma as unknown as {
        telegramTransactionConfirmation: {
          findUnique: (args: {
            where: { id: string };
            include: { transaction: { select: { id: true } } };
          }) => Promise<ConfirmationRecord | null>;
        };
      }
    ).telegramTransactionConfirmation;

    const record = await confirmationModel.findUnique({
      where: { id: confirmationId },
      include: { transaction: { select: { id: true } } },
    });

    return record ? this.toDomain(record) : undefined;
  }

  async findBySourceMessageId(
    chatId: string,
    sourceMessageId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    const confirmationModel = (
      this.prisma as unknown as {
        telegramTransactionConfirmation: {
          findUnique: (args: {
            where: {
              chatId_sourceMessageId: {
                chatId: string;
                sourceMessageId: string;
              };
            };
            include: { transaction: { select: { id: true } } };
          }) => Promise<ConfirmationRecord | null>;
        };
      }
    ).telegramTransactionConfirmation;

    const record = await confirmationModel.findUnique({
      where: {
        chatId_sourceMessageId: {
          chatId,
          sourceMessageId,
        },
      },
      include: { transaction: { select: { id: true } } },
    });

    return record ? this.toDomain(record) : undefined;
  }

  async findPendingByChatId(
    chatId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    const confirmationModel = (
      this.prisma as unknown as {
        telegramTransactionConfirmation: {
          findFirst: (args: {
            where: {
              chatId: string;
              status: TelegramTransactionConfirmationStatus;
            };
            orderBy: { createdAt: 'desc' };
            include: { transaction: { select: { id: true } } };
          }) => Promise<ConfirmationRecord | null>;
        };
      }
    ).telegramTransactionConfirmation;

    const record = await confirmationModel.findFirst({
      where: {
        chatId,
        status: TelegramTransactionConfirmationStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      include: { transaction: { select: { id: true } } },
    });

    if (!record) {
      return undefined;
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      await this.updateConfirmationMany({
        where: {
          id: record.id,
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: { lte: new Date() },
        },
        data: { status: TelegramTransactionConfirmationStatus.EXPIRED },
      });

      return this.findById(record.id);
    }

    return this.toDomain(record);
  }

  async findLatestByChatId(
    chatId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    const confirmationModel = (
      this.prisma as unknown as {
        telegramTransactionConfirmation: {
          findFirst: (args: {
            where: { chatId: string };
            orderBy: { createdAt: 'desc' };
            include: { transaction: { select: { id: true } } };
          }) => Promise<ConfirmationRecord | null>;
        };
      }
    ).telegramTransactionConfirmation;

    const record = await confirmationModel.findFirst({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      include: { transaction: { select: { id: true } } },
    });

    if (!record) {
      return undefined;
    }

    // Expire stale pending confirmations even if the user has not replied yet.
    if (
      record.status === TelegramTransactionConfirmationStatus.PENDING &&
      record.expiresAt.getTime() <= Date.now()
    ) {
      await this.updateConfirmationMany({
        where: {
          id: record.id,
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: { lte: new Date() },
        },
        data: { status: TelegramTransactionConfirmationStatus.EXPIRED },
      });

      return this.findById(record.id);
    }

    return this.toDomain(record);
  }

  async confirm(
    confirmationId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    const now = new Date();

    const confirmationModel = (
      this.prisma as unknown as {
        telegramTransactionConfirmation: {
          updateMany: (args: {
            where: {
              id: string;
              status: TelegramTransactionConfirmationStatus;
              expiresAt: { gt: Date };
            };
            data: { status: TelegramTransactionConfirmationStatus };
          }) => Promise<{ count: number }>;
        };
      }
    ).telegramTransactionConfirmation;

    const result = await confirmationModel.updateMany({
      where: {
        id: confirmationId,
        status: TelegramTransactionConfirmationStatus.PENDING,
        expiresAt: { gt: now },
      },
      data: { status: TelegramTransactionConfirmationStatus.CONFIRMED },
    });

    if (result.count === 0) {
      await this.updateConfirmationMany({
        where: {
          id: confirmationId,
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: { lte: now },
        },
        data: { status: TelegramTransactionConfirmationStatus.EXPIRED },
      });
    }

    return this.findById(confirmationId);
  }

  async markProcessing(
    confirmationId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    await this.updateConfirmationMany({
      where: {
        id: confirmationId,
        status: TelegramTransactionConfirmationStatus.CONFIRMED,
      },
      data: { status: TelegramTransactionConfirmationStatus.PROCESSING },
    });

    return this.findById(confirmationId);
  }

  async cancel(
    confirmationId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    const now = new Date();

    const cancelled = await this.updateConfirmationMany({
      where: {
        id: confirmationId,
        status: TelegramTransactionConfirmationStatus.PENDING,
        expiresAt: { gt: now },
      },
      data: { status: TelegramTransactionConfirmationStatus.CANCELLED },
    });

    if (cancelled.count === 0) {
      await this.updateConfirmationMany({
        where: {
          id: confirmationId,
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: { lte: now },
        },
        data: { status: TelegramTransactionConfirmationStatus.EXPIRED },
      });
    }

    return this.findById(confirmationId);
  }

  /**
   * Links the transaction to its confirmation and completes the confirmation
   * atomically. The unique FK on Transaction.telegramConfirmationId protects
   * against linking one transaction to multiple confirmations.
   */
  async markCompleted(
    confirmationId: string,
    transactionId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    await this.prisma.$transaction(async (tx) => {
      const transactionClient = tx as unknown as {
        telegramTransactionConfirmation: {
          findUnique: (args: {
            where: { id: string };
            select: { id: true; status: true };
          }) => Promise<{
            id: string;
            status: TelegramTransactionConfirmationStatus;
          } | null>;
          update: (args: {
            where: { id: string };
            data: { status: TelegramTransactionConfirmationStatus };
          }) => Promise<unknown>;
        };
        transaction: {
          update: (args: {
            where: { id: string };
            data: { telegramConfirmationId: string };
          }) => Promise<unknown>;
        };
      };

      const confirmation =
        await transactionClient.telegramTransactionConfirmation.findUnique({
          where: { id: confirmationId },
          select: { id: true, status: true },
        });

      if (!confirmation) {
        return;
      }

      if (
        confirmation.status === TelegramTransactionConfirmationStatus.COMPLETED
      ) {
        return;
      }

      if (
        confirmation.status !==
          TelegramTransactionConfirmationStatus.PROCESSING &&
        confirmation.status !== TelegramTransactionConfirmationStatus.CONFIRMED
      ) {
        return;
      }

      await transactionClient.transaction.update({
        where: { id: transactionId },
        data: { telegramConfirmationId: confirmationId },
      });

      await transactionClient.telegramTransactionConfirmation.update({
        where: { id: confirmationId },
        data: { status: TelegramTransactionConfirmationStatus.COMPLETED },
      });
    });

    return this.findById(confirmationId);
  }

  parseAction(
    input: string | { text: string },
  ): 'CONFIRM' | 'CANCEL' | 'UNKNOWN' {
    const text = typeof input === 'string' ? input : input.text;
    const normalized = text.trim().toUpperCase();

    if (
      ['YA', 'YES', 'Y', 'OK', 'CONFIRM', 'KONFIRMASI'].includes(normalized)
    ) {
      return 'CONFIRM';
    }

    if (
      ['BATAL', 'BATALKAN', 'CANCEL', 'CANCELLED', 'N', 'NO', 'TIDAK'].includes(
        normalized,
      )
    ) {
      return 'CANCEL';
    }

    return 'UNKNOWN';
  }

  private toDomain(record: ConfirmationRecord): PendingTransactionConfirmation {
    const intent = JSON.parse(JSON.stringify(record.intent)) as Omit<
      ResolvedTransactionIntent,
      'transactionDate'
    > & {
      transactionDate?: string | Date;
    };

    if (typeof intent.transactionDate === 'string') {
      intent.transactionDate = new Date(intent.transactionDate);
    }

    return {
      id: record.id,
      userId: record.userId,
      chatId: record.chatId,
      sourceMessageId: record.sourceMessageId,
      telegramAccountId: record.telegramAccountId,
      telegramUserId: record.telegramUserId,
      intent: intent as ResolvedTransactionIntent,
      status: record.status,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      ...(record.transaction?.id
        ? { transactionId: record.transaction.id }
        : {}),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private updateConfirmationMany(
    args: ConfirmationUpdateManyArgs,
  ): Promise<{ count: number }> {
    const confirmationModel = (
      this.prisma as unknown as {
        telegramTransactionConfirmation: {
          updateMany: (
            updateArgs: ConfirmationUpdateManyArgs,
          ) => Promise<{ count: number }>;
        };
      }
    ).telegramTransactionConfirmation;

    return confirmationModel.updateMany(args);
  }
}
