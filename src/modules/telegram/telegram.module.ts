import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AIModule } from '../ai/ai.module';

import { TelegramService } from './services/telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramWebhookGuard } from './guards/telegram-webhook.guard';
import { TelegramUpdateParserService } from './services/telegram-update-parser.service';
import { TelegramAccountService } from './services/telegram-account.service';
import { TelegramLinkTokenService } from './services/telegram-link-token.service';

import { TelegramAccountRepository } from './repositories/telegram-account.repository';
import { TelegramMessageRepository } from './repositories/telegram-message.repository';

import { TelegramCommandParser } from './commands/telegram-command.parser';
import { TelegramCommandRouter } from './commands/telegram-command.router';

import { TelegramMessageDispatcherService } from './services/telegram-message-dispatcher.service';
import { TelegramIncomingMessageService } from './services/telegram-incoming-message.service';
import { TelegramMessageProcessingService } from './services/telegram-message-processing.service';
import { TelegramMessageRecoveryService } from './services/telegram-message-recovery.service';

import {
  TELEGRAM_DETERMINISTIC_TRANSACTION_MESSAGE_PARSER,
  TELEGRAM_TEXT_MESSAGE_HANDLER,
  TELEGRAM_TRANSACTION_MESSAGE_PARSER,
} from './telegram.tokens';

import { BasicTransactionMessageParser } from './transaction-message/parsers/transaction-message.parser';
import { TransactionMessagePipelineService } from './transaction-message/services/transaction-message-pipeline.service';
import { TelegramTransactionMessageHandlerService } from './transaction-message/services/telegram-transaction-message-handler.service';

import { TransactionIntentResolutionService } from './transaction-message/services/transaction-intent-resolution.service';
import { TransactionConfirmationService } from './transaction-message/services/transaction-confirmation.service';
import { TransactionConfirmationMessageService } from './transaction-message/services/transaction-confirmation-message.service';
import { TransactionConfirmationReplyService } from './transaction-message/services/transaction-confirmation-reply.service';

import { ConfirmedTransactionService } from './transaction-message/services/confirmed-transaction.service';
import { TelegramTransactionConfirmationService } from './transaction-message/services/telegram-transaction-confirmation.service';
import { TelegramTransactionFlowService } from './transaction-message/services/telegram-transaction-flow.service';

import { TelegramTransactionErrorService } from './services/transaction/telegram-transaction-error.service';
import { TelegramTransactionFlowErrorService } from './services/transaction/telegram-transaction-flow-error.service';
import { AITransactionMessageParser } from './transaction-message/parsers/ai-transaction-message.parser';
import { TelegramTransactionMessageParser } from './transaction-message/parsers/telegram-transaction-message.parser';

@Module({
  imports: [
    ConfigModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    AIModule,
  ],

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
    TelegramMessageRecoveryService,

    AITransactionMessageParser,
    TelegramTransactionMessageParser,

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

    TelegramTransactionErrorService,
    TelegramTransactionFlowErrorService,

    {
      provide: TELEGRAM_DETERMINISTIC_TRANSACTION_MESSAGE_PARSER,
      useExisting: BasicTransactionMessageParser,
    },

    {
      provide: TELEGRAM_TRANSACTION_MESSAGE_PARSER,
      useExisting: TelegramTransactionMessageParser,
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
    TelegramMessageRecoveryService,

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
