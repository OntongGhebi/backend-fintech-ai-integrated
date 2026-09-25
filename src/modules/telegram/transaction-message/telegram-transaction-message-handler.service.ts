import { Injectable } from '@nestjs/common';

import {
  TelegramMessageDispatchContext,
  TelegramTextMessageHandler,
} from '../telegram-message-dispatcher.service';
import { TransactionMessagePipelineService } from './transaction-message-pipeline.service';
import { TransactionMessageInput } from './transaction-message.types';

@Injectable()
export class TelegramTransactionMessageHandlerService implements TelegramTextMessageHandler {
  constructor(
    private readonly transactionMessagePipelineService: TransactionMessagePipelineService,
  ) {}

  async handle(context: TelegramMessageDispatchContext): Promise<void> {
    const input: TransactionMessageInput = {
      userId: context.userId,
      telegramAccountId: context.telegramAccountId,
      telegramUserId: context.telegramUserId,
      chatId: context.chatId,
      messageId: context.messageId,
      text: context.content ?? '',
    };

    await this.transactionMessagePipelineService.process(input);
  }
}
