import { Injectable, Logger } from '@nestjs/common';

import {
  TelegramMessageDirection,
  TelegramMessageType,
  TelegramProcessingStatus,
} from '../../../../generated/prisma/enums.js';

import { TelegramAccountRepository } from '../repositories/telegram-account.repository.js';
import { TelegramMessageRepository } from '../repositories/telegram-message.repository.js';
import { ParsedTelegramMessage } from '../types/telegram-parser.types.js';

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

    const messageType = this.resolveMessageType(message.text);

    const persisted = await this.telegramMessageRepository.findOrCreate({
      telegramAccountId: telegramAccount.id,
      telegramMessageId,
      chatId,
      messageType,
      content: message.text ?? undefined,
      direction: TelegramMessageDirection.INBOUND,
      processingStatus: TelegramProcessingStatus.RECEIVED,
    });

    if (!persisted.created) {
      this.logger.debug(
        `Telegram message already persisted: chatId=${message.chatId}, messageId=${message.messageId}`,
      );
    }

    return {
      id: persisted.message.id,
      telegramAccountId: telegramAccount.id,
      userId: telegramAccount.userId,
      telegramUserId: BigInt(message.telegramUserId),
      chatId,
      telegramMessageId,
      messageType: persisted.message.messageType,
      content: persisted.message.content ?? undefined,
      processingStatus: persisted.message.processingStatus,
      created: persisted.created,
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
