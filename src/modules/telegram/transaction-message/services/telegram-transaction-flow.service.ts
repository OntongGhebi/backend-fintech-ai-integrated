import { Injectable, Logger } from '@nestjs/common';

import { TelegramMessageDispatchContext } from '../../services/telegram-message-dispatcher.service';
import { TelegramService } from '../../services/telegram.service';
import { TelegramTransactionFlowErrorService } from '../../services/transaction/telegram-transaction-flow-error.service';

import { TransactionConfirmationMessageService } from './transaction-confirmation-message.service';
import { TransactionConfirmationService } from './transaction-confirmation.service';
import { TransactionIntentResolutionService } from './transaction-intent-resolution.service';
import { TransactionMessagePipelineService } from './transaction-message-pipeline.service';
import { TelegramTransactionConfirmationService } from './telegram-transaction-confirmation.service';

import { ResolvedTransactionIntent } from '../types/resolved-transaction-intent.types';

@Injectable()
export class TelegramTransactionFlowService {
  private readonly logger = new Logger(TelegramTransactionFlowService.name);

  constructor(
    private readonly transactionMessagePipelineService: TransactionMessagePipelineService,
    private readonly transactionIntentResolutionService: TransactionIntentResolutionService,
    private readonly transactionConfirmationService: TransactionConfirmationService,
    private readonly transactionConfirmationMessageService: TransactionConfirmationMessageService,
    private readonly telegramTransactionConfirmationService: TelegramTransactionConfirmationService,
    private readonly telegramService: TelegramService,
    private readonly telegramTransactionFlowErrorService: TelegramTransactionFlowErrorService,
  ) {}

  async handle(context: TelegramMessageDispatchContext): Promise<void> {
    try {
      await this.handleInternal(context);
    } catch (error) {
      await this.handleUnexpectedError(context, error);
    }
  }

  private async handleInternal(
    context: TelegramMessageDispatchContext,
  ): Promise<void> {
    const confirmationResult =
      await this.telegramTransactionConfirmationService.handle({
        userId: context.userId,
        chatId: context.chatId.toString(),
        sourceMessageId: context.messageId.toString(),
        telegramAccountId: context.telegramAccountId,
        telegramUserId: context.telegramUserId,
        text: context.content ?? '',
      });

    if (confirmationResult.handled) {
      await this.sendMessage(context.chatId, confirmationResult.message);

      return;
    }

    await this.handleNewTransaction(context);
  }

  private async handleNewTransaction(
    context: TelegramMessageDispatchContext,
  ): Promise<void> {
    const parsed = await this.transactionMessagePipelineService.process({
      userId: context.userId,
      telegramAccountId: context.telegramAccountId,
      telegramUserId: context.telegramUserId,
      chatId: context.chatId,
      messageId: context.messageId,
      text: context.content ?? '',
    });

    if (parsed.status === 'ERROR') {
      if (!parsed.errorCode) {
        this.logger.error(
          `AI transaction parsing failed without error code: messageId=${context.messageId.toString()}`,
        );

        await this.sendMessage(
          context.chatId,
          '⚠️ Terjadi masalah saat memproses pesan. Silakan coba lagi.',
        );

        return;
      }

      await this.sendMessage(
        context.chatId,
        this.transactionConfirmationMessageService.formatAIError(
          parsed.errorCode,
        ),
      );

      return;
    }

    if (parsed.status !== 'PARSED' || !parsed.intent) {
      return;
    }

    const resolution = await this.transactionIntentResolutionService.resolve(
      context.userId,
      parsed.intent,
    );

    switch (resolution.status) {
      case 'RESOLVED': {
        if (!resolution.intent) {
          this.logger.warn(
            `Resolved transaction intent is missing for user=${context.userId}`,
          );

          return;
        }

        await this.createPendingConfirmation(context, resolution.intent);

        return;
      }

      case 'NEEDS_ACCOUNT':
        await this.sendMessage(
          context.chatId,
          [
            '🏦 Account belum ditentukan.',
            '',
            'Silakan tentukan account yang digunakan.',
            'Contoh:',
            'beli makan 25000 dari BCA',
          ].join('\n'),
        );

        return;

      case 'NEEDS_CATEGORY':
        await this.sendMessage(
          context.chatId,
          [
            '📂 Category belum ditentukan.',
            '',
            'Silakan tentukan category transaksi.',
          ].join('\n'),
        );

        return;

      case 'NOT_FOUND':
        await this.sendMessage(
          context.chatId,
          '❌ Data transaksi tidak dapat ditemukan. Silakan periksa kembali account atau category yang digunakan.',
        );

        return;

      case 'INVALID':
        await this.sendMessage(
          context.chatId,
          '❌ Data transaksi tidak valid. Silakan periksa kembali format transaksi Anda.',
        );

        return;

      default:
        return;
    }
  }

  private async createPendingConfirmation(
    context: TelegramMessageDispatchContext,
    resolvedIntent: ResolvedTransactionIntent,
  ): Promise<void> {
    const confirmation = this.transactionConfirmationService.create({
      userId: context.userId,
      chatId: context.chatId.toString(),
      sourceMessageId: context.messageId.toString(),
      telegramAccountId: context.telegramAccountId,
      telegramUserId: context.telegramUserId,
      intent: resolvedIntent,
    });

    const message =
      this.transactionConfirmationMessageService.format(confirmation);

    await this.sendMessage(context.chatId, message);
  }

  private async handleUnexpectedError(
    context: TelegramMessageDispatchContext,
    error: unknown,
  ): Promise<void> {
    const message = this.telegramTransactionFlowErrorService.handle(error);

    try {
      await this.telegramService.sendMessage({
        chatId: context.chatId.toString(),
        text: message,
      });
    } catch (sendError) {
      this.logger.error(
        `Failed to send Telegram flow error response to chat=${context.chatId.toString()}`,
        sendError instanceof Error ? sendError.stack : String(sendError),
      );
    }
  }

  private async sendMessage(chatId: bigint, text: string): Promise<void> {
    if (!text.trim()) {
      return;
    }

    try {
      await this.telegramService.sendMessage({
        chatId: chatId.toString(),
        text,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send Telegram response to chat=${chatId.toString()}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }
}
