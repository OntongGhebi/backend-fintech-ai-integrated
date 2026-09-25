import { Injectable, Logger } from '@nestjs/common';
import { TelegramProcessingStatus } from '../../../generated/prisma/enums';
import {
  TelegramMessageDispatcherService,
  TelegramMessageDispatchContext,
} from './telegram-message-dispatcher.service';
import { TelegramMessageRepository } from './repositories/telegram-message.repository';

export interface TelegramMessageProcessingInput {
  messageId: string;
  userId: string;
  telegramAccountId: string;
  telegramUserId: bigint;
  chatId: bigint;
  telegramMessageId: bigint;
  messageType: TelegramMessageDispatchContext['messageType'];
  content?: string;
}

@Injectable()
export class TelegramMessageProcessingService {
  private readonly logger = new Logger(TelegramMessageProcessingService.name);

  constructor(
    private readonly telegramMessageRepository: TelegramMessageRepository,
    private readonly telegramMessageDispatcherService: TelegramMessageDispatcherService,
  ) {}

  async process(input: TelegramMessageProcessingInput): Promise<void> {
    const message = await this.telegramMessageRepository.findById(
      input.messageId,
    );

    if (!message) {
      this.logger.warn(`Telegram message not found: ${input.messageId}`);

      return;
    }

    if (message.processingStatus !== TelegramProcessingStatus.RECEIVED) {
      this.logger.debug(
        `Skipping Telegram message with status ${message.processingStatus}: ${input.messageId}`,
      );

      return;
    }

    await this.telegramMessageRepository.markProcessing(input.messageId);

    const context: TelegramMessageDispatchContext = {
      userId: input.userId,
      telegramAccountId: input.telegramAccountId,
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      messageId: input.telegramMessageId,
      messageType: input.messageType,
      content: input.content,
    };

    try {
      await this.telegramMessageDispatcherService.dispatch(context);

      await this.telegramMessageRepository.markProcessed(input.messageId);
    } catch (error) {
      await this.telegramMessageRepository.markFailed(input.messageId);

      this.logger.error(
        `Failed to process Telegram message: ${input.messageId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }
}
