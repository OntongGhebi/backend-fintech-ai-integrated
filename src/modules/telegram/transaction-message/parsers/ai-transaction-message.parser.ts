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

    const result = await this.aiTransactionIntelligenceService.analyze({
      userId: input.userId,
      text,
    });

    if (result.status === 'ERROR') {
      this.logger.error(
        `AI transaction intelligence failed: messageId=${input.messageId.toString()}, errorCode=${result.errorCode}`,
      );

      return {
        status: 'ERROR',
        rawText: input.text,
        errorCode: result.errorCode,
      };
    }

    if (result.status === 'UNSUPPORTED') {
      return {
        status: 'UNSUPPORTED',
        rawText: input.text,
      };
    }

    if (result.status === 'NEEDS_INFORMATION') {
      if (!result.entities || !result.intent) {
        this.logger.warn(
          `AI transaction intelligence returned incomplete information: messageId=${input.messageId.toString()}`,
        );

        return {
          status: 'INVALID',
          rawText: input.text,
        };
      }

      const { type, amount, description, accountHint, categoryHint } =
        result.entities;

      if (amount === undefined || amount <= 0 || !Number.isFinite(amount)) {
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

      if (type === 'TRANSFER') {
        return {
          status: 'UNSUPPORTED',
          rawText: input.text,
        };
      }

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
    }

    if (!result.intent || !result.entities) {
      this.logger.warn(
        `AI transaction intelligence returned incomplete result: messageId=${input.messageId.toString()}`,
      );

      return {
        status: 'INVALID',
        rawText: input.text,
      };
    }

    const { type, amount, description, accountHint, categoryHint } =
      result.entities;

    if (amount === undefined || amount <= 0 || !Number.isFinite(amount)) {
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

    if (type === 'TRANSFER') {
      return {
        status: 'UNSUPPORTED',
        rawText: input.text,
      };
    }

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
  }
}
