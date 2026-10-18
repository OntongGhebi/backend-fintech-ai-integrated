import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { Prisma } from '../../../../generated/prisma/client';
import { TelegramTransactionConfirmationStatus } from '../../../../generated/prisma/enums';

import {
  CreateTransactionConfirmationInput,
  PendingTransactionConfirmation,
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
  updatedAt?: Date;
  transaction?: { id: string } | null;
};

type ConfirmationUpdateManyArgs = {
  where: {
    id?: string;
    chatId?: string;
    status: TelegramTransactionConfirmationStatus;
    expiresAt?: { lte?: Date; gt?: Date };
    updatedAt?: { lte?: Date };
  };
  data: {
    status: TelegramTransactionConfirmationStatus;
  };
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
      const model = this.confirmationModel();

      const record = await model.create({
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
    const record = await this.confirmationModel().findUnique({
      where: { id: confirmationId },
      include: { transaction: { select: { id: true } } },
    });

    return record ? this.toDomain(record) : undefined;
  }

  async findBySourceMessageId(
    chatId: string,
    sourceMessageId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    const record = await this.confirmationModel().findUnique({
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
    await this.recoverStaleProcessingByChatId(chatId);
    await this.expirePendingByChatId(chatId);

    const record = await this.confirmationModel().findFirst({
      where: {
        chatId,
        status: TelegramTransactionConfirmationStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      include: { transaction: { select: { id: true } } },
    });

    return record ? this.toDomain(record) : undefined;
  }

  async findLatestByChatId(
    chatId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    // Recover first. A recovered confirmation whose TTL has elapsed must
    // expire immediately rather than become actionable again.
    await this.recoverStaleProcessingByChatId(chatId);
    await this.expirePendingByChatId(chatId);

    const record = await this.confirmationModel().findFirst({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      include: { transaction: { select: { id: true } } },
    });

    return record ? this.toDomain(record) : undefined;
  }

  /**
   * Restores abandoned PROCESSING confirmations to PENDING after the recovery
   * threshold. The conditional update prevents a stale recovery request from
   * overwriting a status changed by another request.
   *
   * A transaction and COMPLETED status are committed atomically by the
   * transaction repository, so a stale PROCESSING state is safe to retry.
   */
  async recoverStaleProcessingByChatId(
    chatId: string,
    staleBefore: Date = new Date(Date.now() - this.ttlMs),
  ): Promise<number> {
    const result = await this.updateConfirmationMany({
      where: {
        chatId,
        status: TelegramTransactionConfirmationStatus.PROCESSING,
        updatedAt: { lte: staleBefore },
      },
      data: {
        status: TelegramTransactionConfirmationStatus.PENDING,
      },
    });

    return result.count;
  }

  /**
   * Expires every pending confirmation in the chat whose TTL has elapsed.
   * The status predicate makes concurrent expiry attempts safe.
   */
  async expirePendingByChatId(
    chatId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const result = await this.updateConfirmationMany({
      where: {
        chatId,
        status: TelegramTransactionConfirmationStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: {
        status: TelegramTransactionConfirmationStatus.EXPIRED,
      },
    });

    return result.count;
  }

  async confirm(
    confirmationId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    const now = new Date();

    const result = await this.updateConfirmationMany({
      where: {
        id: confirmationId,
        status: TelegramTransactionConfirmationStatus.PENDING,
        expiresAt: { gt: now },
      },
      data: {
        status: TelegramTransactionConfirmationStatus.CONFIRMED,
      },
    });

    if (result.count === 0) {
      await this.updateConfirmationMany({
        where: {
          id: confirmationId,
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: { lte: now },
        },
        data: {
          status: TelegramTransactionConfirmationStatus.EXPIRED,
        },
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
      data: {
        status: TelegramTransactionConfirmationStatus.PROCESSING,
      },
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
      data: {
        status: TelegramTransactionConfirmationStatus.CANCELLED,
      },
    });

    if (cancelled.count === 0) {
      await this.updateConfirmationMany({
        where: {
          id: confirmationId,
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: { lte: now },
        },
        data: {
          status: TelegramTransactionConfirmationStatus.EXPIRED,
        },
      });
    }

    return this.findById(confirmationId);
  }

  /**
   * Compatibility operation for the existing Telegram confirmation flow.
   * Transaction creation should use the atomic transaction repository method;
   * this method only links a transaction that has already been created.
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
        data: {
          status: TelegramTransactionConfirmationStatus.COMPLETED,
        },
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

  private confirmationModel() {
    return (
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
          findUnique: (args: {
            where:
              | { id: string }
              | {
                  chatId_sourceMessageId: {
                    chatId: string;
                    sourceMessageId: string;
                  };
                };
            include: { transaction: { select: { id: true } } };
          }) => Promise<ConfirmationRecord | null>;
          findFirst: (args: {
            where:
              | { chatId: string }
              | {
                  chatId: string;
                  status: TelegramTransactionConfirmationStatus;
                };
            orderBy: { createdAt: 'desc' };
            include: { transaction: { select: { id: true } } };
          }) => Promise<ConfirmationRecord | null>;
          updateMany: (
            args: ConfirmationUpdateManyArgs,
          ) => Promise<{ count: number }>;
        };
      }
    ).telegramTransactionConfirmation;
  }

  private updateConfirmationMany(
    args: ConfirmationUpdateManyArgs,
  ): Promise<{ count: number }> {
    return this.confirmationModel().updateMany(args);
  }
}
