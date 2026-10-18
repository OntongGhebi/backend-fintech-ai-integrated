import { Injectable } from '@nestjs/common';

import {
  TransactionConfirmationAction,
  TransactionConfirmationService,
} from './transaction-confirmation.service';
import { TransactionConfirmationMessageService } from './transaction-confirmation-message.service';

export interface TransactionConfirmationReplyContext {
  userId: string;
  chatId: string;
  text: string;
}

export interface TransactionConfirmationReplyResult {
  handled: boolean;
  action: TransactionConfirmationAction;
  message: string;
}

@Injectable()
export class TransactionConfirmationReplyService {
  constructor(
    private readonly transactionConfirmationService: TransactionConfirmationService,
    private readonly transactionConfirmationMessageService: TransactionConfirmationMessageService,
  ) {}

  async handle(
    context: TransactionConfirmationReplyContext,
  ): Promise<TransactionConfirmationReplyResult> {
    const pending =
      await this.transactionConfirmationService.findPendingByChatId(
        context.chatId,
      );

    if (!pending || pending.userId !== context.userId) {
      return {
        handled: false,
        action: 'UNKNOWN',
        message:
          this.transactionConfirmationMessageService.formatNoPendingConfirmation(),
      };
    }

    const action = this.transactionConfirmationService.parseAction(
      context.text,
    );

    if (action === 'UNKNOWN') {
      return {
        handled: true,
        action,
        message:
          this.transactionConfirmationMessageService.formatUnknownAction(),
      };
    }

    if (action === 'CONFIRM') {
      const confirmation = await this.transactionConfirmationService.confirm(
        pending.id,
      );

      if (!confirmation) {
        return this.noPendingResult(action);
      }

      if (confirmation.status === 'EXPIRED') {
        return {
          handled: true,
          action,
          message: this.transactionConfirmationMessageService.formatExpired(),
        };
      }

      if (confirmation.status !== 'CONFIRMED') {
        return this.noPendingResult(action);
      }

      return {
        handled: true,
        action,
        message: this.transactionConfirmationMessageService.formatConfirmed(),
      };
    }

    const confirmation = await this.transactionConfirmationService.cancel(
      pending.id,
    );

    if (!confirmation) {
      return this.noPendingResult(action);
    }

    if (confirmation.status === 'EXPIRED') {
      return {
        handled: true,
        action,
        message: this.transactionConfirmationMessageService.formatExpired(),
      };
    }

    if (confirmation.status !== 'CANCELLED') {
      return this.noPendingResult(action);
    }

    return {
      handled: true,
      action,
      message: this.transactionConfirmationMessageService.formatCancelled(),
    };
  }

  private noPendingResult(
    action: TransactionConfirmationAction,
  ): TransactionConfirmationReplyResult {
    return {
      handled: false,
      action,
      message:
        this.transactionConfirmationMessageService.formatNoPendingConfirmation(),
    };
  }
}
