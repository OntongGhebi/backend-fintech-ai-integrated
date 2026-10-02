import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  AITransactionConfirmation,
  AITransactionConfirmationAction,
  AITransactionConfirmationActionResult,
  AITransactionConfirmationResult,
} from '../types/ai-transaction-confirmation.types';

import { AITransactionDraft } from '../types/ai-transaction-draft.types';

@Injectable()
export class AITransactionConfirmationService {
  static readonly DEFAULT_EXPIRATION_MS = 5 * 60 * 1000;

  prepare(
    draft: AITransactionDraft,
    now: Date = new Date(),
  ): AITransactionConfirmationResult {
    if (!draft.ready || draft.status !== 'READY') {
      throw new BadRequestException(
        'Transaction draft is not ready for confirmation',
      );
    }

    const createdAt = new Date(now.getTime());

    const expiresAt = new Date(
      createdAt.getTime() +
        AITransactionConfirmationService.DEFAULT_EXPIRATION_MS,
    );

    const confirmation: AITransactionConfirmation = {
      id: randomUUID(),
      draft,
      status: 'PENDING',
      createdAt,
      expiresAt,
    };

    return {
      confirmation,
      message: this.buildConfirmationMessage(draft),
    };
  }

  confirm(
    confirmation: AITransactionConfirmation,
    now: Date = new Date(),
  ): AITransactionConfirmationActionResult {
    this.validateConfirmation(confirmation, now);

    const confirmed: AITransactionConfirmation = {
      ...confirmation,
      status: 'CONFIRMED',
    };

    return {
      confirmation: confirmed,
      action: 'CONFIRM',
      message: 'Transaction confirmed and ready to be processed.',
    };
  }

  cancel(
    confirmation: AITransactionConfirmation,
    now: Date = new Date(),
  ): AITransactionConfirmationActionResult {
    this.validateConfirmation(confirmation, now);

    const cancelled: AITransactionConfirmation = {
      ...confirmation,
      status: 'CANCELLED',
    };

    return {
      confirmation: cancelled,
      action: 'CANCEL',
      message: 'Transaction confirmation cancelled.',
    };
  }

  isExpired(
    confirmation: AITransactionConfirmation,
    now: Date = new Date(),
  ): boolean {
    return now.getTime() >= confirmation.expiresAt.getTime();
  }

  private validateConfirmation(
    confirmation: AITransactionConfirmation,
    now: Date,
  ): void {
    if (confirmation.status !== 'PENDING') {
      throw new BadRequestException(
        `Transaction confirmation is already ${confirmation.status.toLowerCase()}`,
      );
    }

    if (this.isExpired(confirmation, now)) {
      throw new BadRequestException('Transaction confirmation has expired');
    }
  }

  private buildConfirmationMessage(draft: AITransactionDraft): string {
    const lines: string[] = [
      'Please confirm this transaction:',
      '',
      `Type: ${draft.type}`,
      `Amount: IDR ${this.formatAmount(draft.amount)}`,
    ];

    if (draft.description) {
      lines.push(`Description: ${draft.description}`);
    }

    if (draft.accountId) {
      lines.push(`Source Account: ${draft.accountId}`);
    }

    if (draft.destinationAccountId) {
      lines.push(`Destination Account: ${draft.destinationAccountId}`);
    }

    if (draft.categoryId) {
      lines.push(`Category: ${draft.categoryId}`);
    }

    lines.push('', 'Confirm this transaction?');

    return lines.join('\n');
  }

  private formatAmount(amount: number): string {
    return new Intl.NumberFormat('id-ID').format(amount);
  }
}
