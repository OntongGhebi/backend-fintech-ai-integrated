import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  CreateTransactionConfirmationInput,
  PendingTransactionConfirmation,
} from './transaction-confirmation.types';

export type TransactionConfirmationAction = 'CONFIRM' | 'CANCEL' | 'UNKNOWN';

@Injectable()
export class TransactionConfirmationService {
  private readonly confirmations = new Map<
    string,
    PendingTransactionConfirmation
  >();

  private readonly ttlMs = 5 * 60 * 1000;

  create(
    input: CreateTransactionConfirmationInput,
  ): PendingTransactionConfirmation {
    const existing = this.findBySourceMessageId(
      input.chatId,
      input.sourceMessageId,
    );

    if (existing) {
      return existing;
    }

    const now = new Date();

    const confirmation: PendingTransactionConfirmation = {
      id: randomUUID(),
      userId: input.userId,
      chatId: input.chatId,
      sourceMessageId: input.sourceMessageId,
      telegramAccountId: input.telegramAccountId,
      telegramUserId: input.telegramUserId,
      intent: input.intent,
      status: 'PENDING',
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };

    this.confirmations.set(confirmation.id, confirmation);

    return confirmation;
  }

  findById(confirmationId: string): PendingTransactionConfirmation | undefined {
    return this.confirmations.get(confirmationId);
  }

  findBySourceMessageId(
    chatId: string,
    sourceMessageId: string,
  ): PendingTransactionConfirmation | undefined {
    return Array.from(this.confirmations.values())
      .filter(
        (confirmation) =>
          confirmation.chatId === chatId &&
          confirmation.sourceMessageId === sourceMessageId,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  findPendingByChatId(
    chatId: string,
  ): PendingTransactionConfirmation | undefined {
    const confirmations = Array.from(this.confirmations.values())
      .filter(
        (confirmation) =>
          confirmation.chatId === chatId && confirmation.status === 'PENDING',
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const confirmation = confirmations[0];

    if (!confirmation) {
      return undefined;
    }

    if (confirmation.expiresAt.getTime() <= Date.now()) {
      confirmation.status = 'EXPIRED';

      return confirmation;
    }

    return confirmation;
  }

  findLatestByChatId(
    chatId: string,
  ): PendingTransactionConfirmation | undefined {
    return Array.from(this.confirmations.values())
      .filter((confirmation) => confirmation.chatId === chatId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  parseAction(input: string | { text: string }): TransactionConfirmationAction {
    const text = typeof input === 'string' ? input : input.text;

    const normalized = text.trim().toUpperCase();

    if (
      normalized === 'YA' ||
      normalized === 'YES' ||
      normalized === 'Y' ||
      normalized === 'OK' ||
      normalized === 'CONFIRM' ||
      normalized === 'KONFIRMASI'
    ) {
      return 'CONFIRM';
    }

    if (
      normalized === 'BATAL' ||
      normalized === 'BATALKAN' ||
      normalized === 'CANCEL' ||
      normalized === 'CANCELLED' ||
      normalized === 'N' ||
      normalized === 'NO' ||
      normalized === 'TIDAK'
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

      return confirmation;
    }

    confirmation.status = 'CONFIRMED';

    return confirmation;
  }

  markProcessing(
    confirmationId: string,
  ): PendingTransactionConfirmation | undefined {
    const confirmation = this.confirmations.get(confirmationId);

    if (!confirmation) {
      return undefined;
    }

    if (confirmation.status !== 'CONFIRMED') {
      return confirmation;
    }

    confirmation.status = 'PROCESSING';

    return confirmation;
  }

  markCompleted(
    confirmationId: string,
    transactionId: string,
  ): PendingTransactionConfirmation | undefined {
    const confirmation = this.confirmations.get(confirmationId);

    if (!confirmation) {
      return undefined;
    }

    if (confirmation.status === 'COMPLETED') {
      return confirmation;
    }

    confirmation.status = 'COMPLETED';
    confirmation.transactionId = transactionId;

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

      return confirmation;
    }

    confirmation.status = 'CANCELLED';

    return confirmation;
  }
}
