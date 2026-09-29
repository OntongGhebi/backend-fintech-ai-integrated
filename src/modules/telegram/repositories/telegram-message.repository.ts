import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma/prisma.service';
import {
  TelegramMessageDirection,
  TelegramProcessingStatus,
  TelegramMessageType,
} from '../../../../generated/prisma/enums';
import { Prisma } from '../../../../generated/prisma/client';

export interface CreateTelegramMessageData {
  telegramAccountId: string;
  telegramMessageId: bigint;
  chatId: bigint;
  messageType: TelegramMessageType;
  content?: string;
  direction: TelegramMessageDirection;
  processingStatus?: TelegramProcessingStatus;
}

@Injectable()
export class TelegramMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTelegramMessageData) {
    return this.prisma.telegramMessage.create({
      data: {
        telegramAccountId: data.telegramAccountId,
        telegramMessageId: data.telegramMessageId,
        chatId: data.chatId,
        messageType: data.messageType,
        content: data.content,
        direction: data.direction,
        processingStatus:
          data.processingStatus ?? TelegramProcessingStatus.RECEIVED,
      },
    });
  }

  async findOrCreate(data: CreateTelegramMessageData) {
    try {
      return {
        message: await this.create(data),
        created: true,
      };
    } catch (error) {
      if (!this.isTelegramMessageUniqueViolation(error)) {
        throw error;
      }

      const existingMessage = await this.findByTelegramMessageId(
        data.chatId,
        data.telegramMessageId,
      );

      if (!existingMessage) {
        throw error;
      }

      return {
        message: existingMessage,
        created: false,
      };
    }
  }

  async findByTelegramMessageId(chatId: bigint, telegramMessageId: bigint) {
    return this.prisma.telegramMessage.findUnique({
      where: {
        chatId_telegramMessageId: {
          chatId,
          telegramMessageId,
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.telegramMessage.findUnique({
      where: {
        id,
      },
    });
  }

  async claimProcessing(id: string): Promise<boolean> {
    const result = await this.prisma.telegramMessage.updateMany({
      where: {
        id,
        processingStatus: TelegramProcessingStatus.RECEIVED,
      },
      data: {
        processingStatus: TelegramProcessingStatus.PROCESSING,
        processingStartedAt: new Date(),
        processingAttempts: {
          increment: 1,
        },
      },
    });

    return result.count === 1;
  }

  async markProcessing(id: string) {
    return this.prisma.telegramMessage.update({
      where: {
        id,
      },
      data: {
        processingStatus: TelegramProcessingStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
    });
  }

  async markProcessed(id: string) {
    return this.prisma.telegramMessage.update({
      where: {
        id,
      },
      data: {
        processingStatus: TelegramProcessingStatus.PROCESSED,
        processingStartedAt: null,
        processedAt: new Date(),
      },
    });
  }

  async markFailed(id: string) {
    return this.prisma.telegramMessage.update({
      where: {
        id,
      },
      data: {
        processingStatus: TelegramProcessingStatus.FAILED,
        processingStartedAt: null,
      },
    });
  }

  async markIgnored(id: string) {
    return this.prisma.telegramMessage.update({
      where: {
        id,
      },
      data: {
        processingStatus: TelegramProcessingStatus.IGNORED,
        processingStartedAt: null,
      },
    });
  }

  async recoverStaleProcessing(staleBefore: Date): Promise<number> {
    const result = await this.prisma.telegramMessage.updateMany({
      where: {
        processingStatus: TelegramProcessingStatus.PROCESSING,
        processingStartedAt: {
          lt: staleBefore,
        },
      },
      data: {
        processingStatus: TelegramProcessingStatus.RECEIVED,
        processingStartedAt: null,
      },
    });

    return result.count;
  }

  private isTelegramMessageUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
