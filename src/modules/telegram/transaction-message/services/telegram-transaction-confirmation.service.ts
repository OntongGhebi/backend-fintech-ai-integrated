import { Injectable } from '@nestjs/common';

import { ConfirmedTransactionService } from './confirmed-transaction.service';
import { PendingTransactionConfirmation } from '../types/transaction-confirmation.types';
import { TransactionConfirmationMessageService } from './transaction-confirmation-message.service';
import { TransactionConfirmationService } from './transaction-confirmation.service';
import { TelegramTransactionErrorService } from '../../services/transaction/telegram-transaction-error.service';

export interface TelegramTransactionConfirmationContext {
  userId: string;
  chatId: string;
  sourceMessageId: string;
  telegramAccountId: string;
  telegramUserId: bigint;
  text: string;
}

export type TelegramTransactionConfirmationResultStatus =
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'PROCESSING'
  | 'NONE'
  | 'UNKNOWN';

export interface TelegramTransactionConfirmationResult {
  handled: boolean;
  action: 'CONFIRM' | 'CANCEL' | 'UNKNOWN' | 'NONE';
  status: TelegramTransactionConfirmationResultStatus;
  message: string;
  transactionId?: string;
}

@Injectable()
export class TelegramTransactionConfirmationService {
  constructor(
    private readonly transactionConfirmationService: TransactionConfirmationService,
    private readonly transactionConfirmationMessageService: TransactionConfirmationMessageService,
    private readonly confirmedTransactionService: ConfirmedTransactionService,
    private readonly telegramTransactionErrorService: TelegramTransactionErrorService,
  ) {}

  async handle(
    context: TelegramTransactionConfirmationContext,
  ): Promise<TelegramTransactionConfirmationResult> {
    const latest = this.transactionConfirmationService.findLatestByChatId(
      context.chatId,
    );

    if (!latest) {
      return this.noPendingResult();
    }

    if (latest.userId !== context.userId) {
      return this.noPendingResult();
    }

    switch (latest.status) {
      case 'COMPLETED':
        return {
          handled: true,
          action: 'NONE',
          status: 'COMPLETED',
          message:
            this.transactionConfirmationMessageService.formatAlreadyProcessed(),
          transactionId: latest.transactionId,
        };

      case 'PROCESSING':
        return {
          handled: true,
          action: 'NONE',
          status: 'PROCESSING',
          message:
            this.transactionConfirmationMessageService.formatProcessing(),
        };

      case 'EXPIRED':
        return {
          handled: true,
          action: 'NONE',
          status: 'EXPIRED',
          message: this.transactionConfirmationMessageService.formatExpired(),
        };

      case 'CANCELLED':
        return this.noPendingResult();

      case 'PENDING':
      case 'CONFIRMED':
        break;

      default:
        return this.noPendingResult();
    }

    const action = this.transactionConfirmationService.parseAction(
      context.text,
    );

    if (action === 'UNKNOWN') {
      return {
        handled: true,
        action: 'UNKNOWN',
        status: 'UNKNOWN',
        message:
          this.transactionConfirmationMessageService.formatUnknownAction(),
      };
    }

    if (action === 'CANCEL') {
      return this.handleCancel(latest);
    }

    const confirmation = this.transactionConfirmationService.confirm(latest.id);

    if (!confirmation) {
      return this.noPendingResult();
    }

    if (confirmation.status === 'EXPIRED') {
      return {
        handled: true,
        action: 'CONFIRM',
        status: 'EXPIRED',
        message: this.transactionConfirmationMessageService.formatExpired(),
      };
    }

    if (confirmation.status === 'PROCESSING') {
      return {
        handled: true,
        action: 'CONFIRM',
        status: 'PROCESSING',
        message: this.transactionConfirmationMessageService.formatProcessing(),
      };
    }

    if (confirmation.status === 'COMPLETED') {
      return {
        handled: true,
        action: 'CONFIRM',
        status: 'COMPLETED',
        message:
          this.transactionConfirmationMessageService.formatAlreadyProcessed(),
        transactionId: confirmation.transactionId,
      };
    }

    return this.processConfirmed(confirmation);
  }

  private handleCancel(
    confirmation: PendingTransactionConfirmation,
  ): TelegramTransactionConfirmationResult {
    const result = this.transactionConfirmationService.cancel(confirmation.id);

    if (!result) {
      return this.noPendingResult();
    }

    if (result.status === 'EXPIRED') {
      return {
        handled: true,
        action: 'CANCEL',
        status: 'EXPIRED',
        message: this.transactionConfirmationMessageService.formatExpired(),
      };
    }

    return {
      handled: true,
      action: 'CANCEL',
      status: 'CANCELLED',
      message: this.transactionConfirmationMessageService.formatCancelled(),
    };
  }

  private async processConfirmed(
    confirmation: PendingTransactionConfirmation,
  ): Promise<TelegramTransactionConfirmationResult> {
    const processing = this.transactionConfirmationService.markProcessing(
      confirmation.id,
    );

    if (!processing) {
      return this.noPendingResult();
    }

    if (processing.status === 'COMPLETED') {
      return {
        handled: true,
        action: 'CONFIRM',
        status: 'COMPLETED',
        message:
          this.transactionConfirmationMessageService.formatAlreadyProcessed(),
        transactionId: processing.transactionId,
      };
    }

    if (processing.status !== 'PROCESSING') {
      return this.noPendingResult();
    }

    try {
      const transaction =
        await this.confirmedTransactionService.create(processing);

      this.transactionConfirmationService.markCompleted(
        processing.id,
        transaction.id,
      );

      return {
        handled: true,
        action: 'CONFIRM',
        status: 'COMPLETED',
        message:
          this.transactionConfirmationMessageService.formatTransactionCreated({
            id: transaction.id,
            type: transaction.type,
            amount: Number(transaction.amount),
            description: transaction.description,
          }),
        transactionId: transaction.id,
      };
    } catch (error) {
      return {
        handled: true,
        action: 'CONFIRM',
        status: 'PROCESSING',
        message: this.telegramTransactionErrorService.handle(error),
      };
    }
  }

  private noPendingResult(): TelegramTransactionConfirmationResult {
    return {
      handled: false,
      action: 'NONE',
      status: 'NONE',
      message:
        this.transactionConfirmationMessageService.formatNoPendingConfirmation(),
    };
  }
}
