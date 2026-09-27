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
import { TelegramMessageProcessingService } from './telegram-message-processing.service';

import {
  TELEGRAM_TEXT_MESSAGE_HANDLER,
  TELEGRAM_TRANSACTION_MESSAGE_PARSER,
} from './telegram.tokens';

import { BasicTransactionMessageParser } from './transaction-message/transaction-message.parser';
import { TransactionMessagePipelineService } from './transaction-message/transaction-message-pipeline.service';
import { TelegramTransactionMessageHandlerService } from './transaction-message/telegram-transaction-message-handler.service';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionIntentResolutionService } from './transaction-message/transaction-intent-resolution.service';
import { TransactionConfirmationService } from './transaction-message/transaction-confirmation.service';
import { TransactionConfirmationMessageService } from './transaction-message/transaction-confirmation-message.service';
import { TransactionConfirmationReplyService } from './transaction-message/transaction-confirmation-reply.service';
import { TransactionsModule } from '../transactions/transactions.module';
import { ConfirmedTransactionService } from './transaction-message/confirmed-transaction.service';
import { TelegramTransactionConfirmationService } from './transaction-message/telegram-transaction-confirmation.service';
import { TelegramTransactionFlowService } from './transaction-message/telegram-transaction-flow.service';

@Module({
  imports: [ConfigModule, AccountsModule, CategoriesModule, TransactionsModule],

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
    TelegramMessageProcessingService,

    BasicTransactionMessageParser,
    TransactionMessagePipelineService,

    TelegramTransactionMessageHandlerService,

    TransactionIntentResolutionService,
    TransactionConfirmationService,
    TransactionConfirmationMessageService,
    TransactionConfirmationReplyService,
    ConfirmedTransactionService,
    TelegramTransactionConfirmationService,
    TelegramTransactionFlowService,

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
    TelegramMessageProcessingService,
    TransactionMessagePipelineService,
    TransactionIntentResolutionService,
    TransactionConfirmationService,
    TransactionConfirmationMessageService,
    TransactionConfirmationReplyService,
    ConfirmedTransactionService,
    TelegramTransactionConfirmationService,
    TelegramTransactionFlowService,
  ],
})
export class telegramModule {}
