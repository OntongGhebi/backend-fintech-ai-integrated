import { Injectable } from '@nestjs/common';

import { TransactionConfirmationService } from './transaction-confirmation.service';
import { TransactionConfirmationAction } from './transaction-confirmation.service';
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

  handle(
    context: TransactionConfirmationReplyContext,
  ): TransactionConfirmationReplyResult {
    const pending = this.transactionConfirmationService.findPendingByChatId(
      context.chatId,
    );

    if (!pending) {
      return {
        handled: false,
        action: 'UNKNOWN',
        message:
          this.transactionConfirmationMessageService.formatNoPendingConfirmation(),
      };
    }

    if (pending.userId !== context.userId) {
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
      const confirmation = this.transactionConfirmationService.confirm(
        pending.id,
      );

      if (!confirmation) {
        return {
          handled: false,
          action,
          message:
            this.transactionConfirmationMessageService.formatNoPendingConfirmation(),
        };
      }

      if (confirmation.status === 'EXPIRED') {
        return {
          handled: true,
          action,
          message: this.transactionConfirmationMessageService.formatExpired(),
        };
      }

      return {
        handled: true,
        action,
        message: this.transactionConfirmationMessageService.formatConfirmed(),
      };
    }

    const confirmation = this.transactionConfirmationService.cancel(pending.id);

    if (!confirmation) {
      return {
        handled: false,
        action,
        message:
          this.transactionConfirmationMessageService.formatNoPendingConfirmation(),
      };
    }

    if (confirmation.status === 'EXPIRED') {
      return {
        handled: true,
        action,
        message: this.transactionConfirmationMessageService.formatExpired(),
      };
    }

    return {
      handled: true,
      action,
      message: this.transactionConfirmationMessageService.formatCancelled(),
    };
  }
}
