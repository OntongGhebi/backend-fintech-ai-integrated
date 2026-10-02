import { Injectable } from '@nestjs/common';

import {
  TelegramMessageDispatchContext,
  TelegramTextMessageHandler,
} from '../../services/telegram-message-dispatcher.service';

import { TelegramTransactionFlowService } from './telegram-transaction-flow.service';

@Injectable()
export class TelegramTransactionMessageHandlerService implements TelegramTextMessageHandler {
  constructor(
    private readonly telegramTransactionFlowService: TelegramTransactionFlowService,
  ) {}

  async handle(context: TelegramMessageDispatchContext): Promise<void> {
    await this.telegramTransactionFlowService.handle(context);
  }
}
