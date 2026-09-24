import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma/prisma.service';
import {
  TelegramMessageDirection,
  TelegramProcessingStatus,
  TelegramMessageType,
} from '../../../../generated/prisma/enums.js';

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

  async markProcessing(id: string) {
    return this.prisma.telegramMessage.update({
      where: {
        id,
      },
      data: {
        processingStatus: TelegramProcessingStatus.PROCESSING,
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
      },
    });
  }
}
