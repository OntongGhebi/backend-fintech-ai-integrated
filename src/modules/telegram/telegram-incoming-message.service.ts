import { Injectable, Logger } from '@nestjs/common';

import {
  TelegramMessageDirection,
  TelegramProcessingStatus,
  TelegramMessageType,
} from '../../../generated/prisma/enums.js';

import { TelegramAccountRepository } from './repositories/telegram-account.repository';
import { TelegramMessageRepository } from './repositories/telegram-message.repository';
import { ParsedTelegramMessage } from './telegram-parser.types';

@Injectable()
export class TelegramIncomingMessageService {
  private readonly logger = new Logger(TelegramIncomingMessageService.name);

  constructor(
    private readonly telegramAccountRepository: TelegramAccountRepository,
    private readonly telegramMessageRepository: TelegramMessageRepository,
  ) {}

  async persist(message: ParsedTelegramMessage) {
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

    const existingMessage =
      await this.telegramMessageRepository.findByTelegramMessageId(
        BigInt(message.chatId),
        BigInt(message.messageId),
      );

    if (existingMessage) {
      this.logger.debug(
        `Telegram message already persisted: chatId=${message.chatId}, messageId=${message.messageId}`,
      );

      return existingMessage;
    }

    const messageType = this.resolveMessageType(message.text);

    return this.telegramMessageRepository.create({
      telegramAccountId: telegramAccount.id,
      telegramMessageId: BigInt(message.messageId),
      chatId: BigInt(message.chatId),
      messageType,
      content: message.text ?? undefined,
      direction: TelegramMessageDirection.INBOUND,
      processingStatus: TelegramProcessingStatus.RECEIVED,
    });
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
