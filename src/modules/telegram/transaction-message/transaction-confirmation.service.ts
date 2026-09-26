import { Injectable } from '@nestjs/common';
import {
  PendingTransactionConfirmation,
  TransactionConfirmationAction,
} from './transaction-confirmation.types';
import { ResolvedTransactionIntent } from './resolved-transaction-intent.types';

interface CreatedPendingConfirmationInput {
  userId: string;
  telegramAccountId: string;
  telegramUserId: string;
  chatId: string;
  sourceMessageId: string;
  intent: ResolvedTransactionIntent;
}

@Injectable()
export class TransactionConfirmationService {
  private readonly confirmations = new Map<
    string,
    PendingTransactionConfirmation
  >();

  private readonly confirmationTtlMs = 5 * 60 * 1000;

  create(
    input: CreatedPendingConfirmationInput,
  ): PendingTransactionConfirmation {
    const id = crypto.randomUUID();
    const now = new Date();
    const confirmation: PendingTransactionConfirmation = {
      id,
      userId: input.userId,
      telegramAccountId: input.telegramAccountId,
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      sourceMessageId: input.sourceMessageId,
      intent: input.intent,
      status: 'PENDING',
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.confirmationTtlMs),
    };

    this.confirmations.set(id, confirmation);

    return confirmation;
  }

  findPendingByChatId(
    chatId: string,
  ): PendingTransactionConfirmation | undefined {
    const confirmation = Array.from(this.confirmations.values()).find(
      (item) => item.chatId === chatId && item.status === 'PENDING',
    );

    if (!confirmation) {
      return undefined;
    }

    if (confirmation.expiresAt.getTime() <= Date.now()) {
      confirmation.status = 'EXPIRED';

      this.confirmations.set(confirmation.id, confirmation);

      return undefined;
    }

    return confirmation;
  }

  parseAction(text: string): TransactionConfirmationAction {
    const normalized = text.trim().toLowerCase();

    if (
      normalized === 'ya' ||
      normalized === 'yaa' ||
      normalized === 'yes' ||
      normalized === 'y'
    ) {
      return 'CONFIRM';
    }

    if (
      normalized === 'batal' ||
      normalized === 'cancel' ||
      normalized === 'no' ||
      normalized === 'tidak' ||
      normalized === 'n'
    ) {
      return 'CANCEL';
    }

    return 'UNKNOWN';
  }

  confirm(confirmationId: string): PendingTransactionConfirmation | undefined {
    const confirmation = this.confirmations.get(confirmationId);

    if (!confirmation) {
      return undefined;
    }

    if (confirmation.status !== 'PENDING') {
      return confirmation;
    }

    if (confirmation.expiresAt.getTime() <= Date.now()) {
      confirmation.status = 'EXPIRED';

      this.confirmations.set(confirmation.id, confirmation);

      return confirmation;
    }

    confirmation.status = 'CONFIRMED';

    this.confirmations.set(confirmation.id, confirmation);

    return confirmation;
  }

  cancel(confirmationId: string): PendingTransactionConfirmation | undefined {
    const confirmation = this.confirmations.get(confirmationId);

    if (!confirmation) {
      return undefined;
    }

    if (confirmation.status !== 'PENDING') {
      return confirmation;
    }

    if (confirmation.expiresAt.getTime() <= Date.now()) {
      confirmation.status = 'EXPIRED';

      this.confirmations.set(confirmation.id, confirmation);

      return confirmation;
    }

    confirmation.status = 'CANCELLED';

    this.confirmations.set(confirmation.id, confirmation);

    return confirmation;
  }
}
