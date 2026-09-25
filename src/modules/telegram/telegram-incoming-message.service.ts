import { Injectable, Logger } from '@nestjs/common';

import {
  TelegramMessageDirection,
  TelegramMessageType,
  TelegramProcessingStatus,
} from '../../../generated/prisma/enums.js';

import { TelegramAccountRepository } from './repositories/telegram-account.repository';
import { TelegramMessageRepository } from './repositories/telegram-message.repository';
import { ParsedTelegramMessage } from './telegram-parser.types';

export interface PersistedTelegramMessage {
  id: string;
  telegramAccountId: string;
  userId: string;
  telegramUserId: bigint;
  chatId: bigint;
  telegramMessageId: bigint;
  messageType: TelegramMessageType;
  content?: string;
  processingStatus: TelegramProcessingStatus;
  created: boolean;
}

@Injectable()
export class TelegramIncomingMessageService {
  private readonly logger = new Logger(TelegramIncomingMessageService.name);

  constructor(
    private readonly telegramAccountRepository: TelegramAccountRepository,
    private readonly telegramMessageRepository: TelegramMessageRepository,
  ) {}

  async persist(
    message: ParsedTelegramMessage,
  ): Promise<PersistedTelegramMessage | null> {
    const telegramAccount =
      await this.telegramAccountRepository.findByTelegramUserId(
        BigInt(message.telegramUserId),
      );

    if (!telegramAccount) {
      this.logger.debug(
        `Ignoring Telegram message from unlinked Telegram user ${message.telegramUserId}`,
      );

      return null;
    }

    const telegramMessageId = BigInt(message.messageId);

    const chatId = BigInt(message.chatId);

    const existingMessage =
      await this.telegramMessageRepository.findByTelegramMessageId(
        chatId,
        telegramMessageId,
      );

    if (existingMessage) {
      this.logger.debug(
        `Telegram message already persisted: chatId=${message.chatId}, messageId=${message.messageId}`,
      );

      return {
        id: existingMessage.id,
        telegramAccountId: telegramAccount.id,
        userId: telegramAccount.userId,
        telegramUserId: BigInt(message.telegramUserId),
        chatId,
        telegramMessageId,
        messageType: existingMessage.messageType,
        content: existingMessage.content ?? undefined,
        processingStatus: existingMessage.processingStatus,
        created: false,
      };
    }

    const messageType = this.resolveMessageType(message.text);

    const createdMessage = await this.telegramMessageRepository.create({
      telegramAccountId: telegramAccount.id,
      telegramMessageId,
      chatId,
      messageType,
      content: message.text ?? undefined,
      direction: TelegramMessageDirection.INBOUND,
      processingStatus: TelegramProcessingStatus.RECEIVED,
    });

    return {
      id: createdMessage.id,
      telegramAccountId: telegramAccount.id,
      userId: telegramAccount.userId,
      telegramUserId: BigInt(message.telegramUserId),
      chatId,
      telegramMessageId,
      messageType: createdMessage.messageType,
      content: createdMessage.content ?? undefined,
      processingStatus: createdMessage.processingStatus,
      created: true,
    };
  }

  private resolveMessageType(text: string | undefined): TelegramMessageType {
    if (!text?.trim()) {
      return TelegramMessageType.OTHER;
    }

    if (text.trim().startsWith('/')) {
      return TelegramMessageType.COMMAND;
    }

    return TelegramMessageType.TEXT;
  }
}
