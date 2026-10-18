import { Injectable } from '@nestjs/common';

import { TelegramTransactionConfirmationRepository } from '../../repositories/telegram-transaction-confirmation.repository';
import {
  CreateTransactionConfirmationInput,
  PendingTransactionConfirmation,
} from '../types/transaction-confirmation.types';

export type TransactionConfirmationAction = 'CONFIRM' | 'CANCEL' | 'UNKNOWN';

@Injectable()
export class TransactionConfirmationService {
  constructor(
    private readonly repository: TelegramTransactionConfirmationRepository,
  ) {}

  async create(
    input: CreateTransactionConfirmationInput,
  ): Promise<PendingTransactionConfirmation> {
    return this.repository.create(input);
  }

  async findById(
    confirmationId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    return this.repository.findById(confirmationId);
  }

  async findBySourceMessageId(
    chatId: string,
    sourceMessageId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    return this.repository.findBySourceMessageId(chatId, sourceMessageId);
  }

  async findPendingByChatId(
    chatId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    return this.repository.findPendingByChatId(chatId);
  }

  async findLatestByChatId(
    chatId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    return this.repository.findLatestByChatId(chatId);
  }

  parseAction(input: string | { text: string }): TransactionConfirmationAction {
    const text = typeof input === 'string' ? input : input.text;
    const normalized = text.trim().toUpperCase();

    if (
      ['YA', 'YES', 'Y', 'OK', 'CONFIRM', 'KONFIRMASI'].includes(normalized)
    ) {
      return 'CONFIRM';
    }

    if (
      ['BATAL', 'BATALKAN', 'CANCEL', 'CANCELLED', 'N', 'NO', 'TIDAK'].includes(
        normalized,
      )
    ) {
      return 'CANCEL';
    }

    return 'UNKNOWN';
  }

  async confirm(
    confirmationId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    return this.repository.confirm(confirmationId);
  }

  async markProcessing(
    confirmationId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    return this.repository.markProcessing(confirmationId);
  }

  async markCompleted(
    confirmationId: string,
    transactionId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    return this.repository.markCompleted(confirmationId, transactionId);
  }

  async cancel(
    confirmationId: string,
  ): Promise<PendingTransactionConfirmation | undefined> {
    return this.repository.cancel(confirmationId);
  }
}
