import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramWebhookGuard } from './telegram-webhook.guard';
import { TelegramUpdateParserService } from './telegram-update-parser.service';
import { TelegramAccountService } from './telegram-account.service';
import { TelegramLinkTokenService } from './telegram-link-token.service';

import { TelegramAccountRepository } from './repositories/telegram-account.repository';
import { TelegramMessageRepository } from './repositories/telegram-message.repository';

import { TelegramCommandParser } from './commands/telegram-command.parser';
import { TelegramCommandRouter } from './commands/telegram-command.router';

import { TelegramMessageDispatcherService } from './telegram-message-dispatcher.service';
import { TelegramIncomingMessageService } from './telegram-incoming-message.service';

import {
  TELEGRAM_TEXT_MESSAGE_HANDLER,
  TELEGRAM_TRANSACTION_MESSAGE_PARSER,
} from './telegram.tokens';

import { BasicTransactionMessageParser } from './transaction-message/transaction-message.parser';
import { TransactionMessagePipelineService } from './transaction-message/transaction-message-pipeline.service';
import { TelegramTransactionMessageHandlerService } from './transaction-message/telegram-transaction-message-handler.service';

@Module({
  imports: [ConfigModule],

  controllers: [TelegramController],

  providers: [
    TelegramService,
    TelegramAccountService,
    TelegramLinkTokenService,

    TelegramUpdateParserService,
    TelegramWebhookGuard,

    TelegramAccountRepository,
    TelegramMessageRepository,

    TelegramCommandParser,
    TelegramCommandRouter,

    TelegramIncomingMessageService,
    TelegramMessageDispatcherService,

    BasicTransactionMessageParser,
    TransactionMessagePipelineService,

    TelegramTransactionMessageHandlerService,

    {
      provide: TELEGRAM_TRANSACTION_MESSAGE_PARSER,
      useExisting: BasicTransactionMessageParser,
    },

    {
      provide: TELEGRAM_TEXT_MESSAGE_HANDLER,
      useExisting: TelegramTransactionMessageHandlerService,
    },
  ],

  exports: [
    TelegramService,
    TelegramAccountService,
    TelegramUpdateParserService,
    TelegramCommandParser,
    TelegramCommandRouter,

    TelegramMessageDispatcherService,
    TelegramIncomingMessageService,
    TransactionMessagePipelineService,
  ],
})
export class telegramModule {}
