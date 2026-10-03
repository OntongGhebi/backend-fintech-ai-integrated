import { Injectable, Logger } from '@nestjs/common';

import { AITransactionIntelligenceService } from '../../../ai/services/ai-transaction-intelligence.service';

import type {
  ParsedTransactionMessage,
  TransactionMessageInput,
  TransactionMessageParser,
} from '../types/transaction-message.types';

@Injectable()
export class AITransactionMessageParser implements TransactionMessageParser {
  private readonly logger = new Logger(AITransactionMessageParser.name);

  constructor(
    private readonly aiTransactionIntelligenceService: AITransactionIntelligenceService,
  ) {}

  async parse(
    input: TransactionMessageInput,
  ): Promise<ParsedTransactionMessage> {
    const text = input.text.trim();

    if (!text) {
      return {
        status: 'INVALID',
        rawText: input.text,
      };
    }

    try {
      const result = await this.aiTransactionIntelligenceService.analyze({
        userId: input.userId,
        text,
      });

      if (result.status === 'UNSUPPORTED') {
        return {
          status: 'UNSUPPORTED',
          rawText: input.text,
        };
      }

      if (!result.intent || !result.entities) {
        this.logger.warn(
          `AI transaction intelligence returned incomplete result for message=${input.messageId.toString()}`,
        );

        return {
          status: 'INVALID',
          rawText: input.text,
        };
      }

      const { type, amount, description, accountHint, categoryHint } =
        result.entities;

      if (!amount || amount <= 0) {
        return {
          status: 'INVALID',
          rawText: input.text,
        };
      }

      if (type !== 'INCOME' && type !== 'EXPENSE' && type !== 'TRANSFER') {
        return {
          status: 'UNSUPPORTED',
          rawText: input.text,
        };
      }

      if (!description?.trim()) {
        return {
          status: 'INVALID',
          rawText: input.text,
        };
      }

      /**
       * Telegram transaction intent currently supports
       * income and expense only.
       *
       * Transfer will be integrated through a dedicated
       * Telegram transfer flow in a later phase.
       */
      if (type === 'TRANSFER') {
        return {
          status: 'UNSUPPORTED',
          rawText: input.text,
        };
      }

      /**
       * Even when AI intelligence returns NEEDS_INFORMATION,
       * the extracted transaction intent can still be passed
       * to the existing Telegram resolution flow.
       *
       * This allows the existing flow to respond with:
       * - NEEDS_ACCOUNT
       * - NOT_FOUND
       * - INVALID
       *
       * instead of silently dropping the transaction.
       */
      return {
        status: 'PARSED',
        rawText: input.text,
        intent: {
          intent: 'CREATE_TRANSACTION',
          transactionType: type,
          amount,
          description: description.trim(),
          categoryHint: categoryHint?.trim() || undefined,
          accountHint: accountHint?.trim() || undefined,
          transactionDate: undefined,
          confidence: result.intent.confidence,
          source: 'AI',
        },
      };
    } catch (error) {
      this.logger.warn(
        `AI Telegram transaction intelligence failed for message=${input.messageId.toString()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {
        status: 'UNSUPPORTED',
        rawText: input.text,
      };
    }
  }
}
