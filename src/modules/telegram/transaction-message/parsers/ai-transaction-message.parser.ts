import { Injectable, Logger } from '@nestjs/common';

import { AIIntentClassifierService } from '../../../ai/services/ai-intent-classifier.service';
import { AITransactionEntityExtractorService } from '../../../ai/services/ai-transaction-entity-extractor.service';

import type {
  TransactionMessageInput,
  TransactionMessageParser,
  ParsedTransactionMessage,
} from '../types/transaction-message.types';

@Injectable()
export class AITransactionMessageParser implements TransactionMessageParser {
  private readonly logger = new Logger(AITransactionMessageParser.name);

  constructor(
    private readonly aiIntentClassifierService: AIIntentClassifierService,
    private readonly aiTransactionEntityExtractorService: AITransactionEntityExtractorService,
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
      const intent = await this.aiIntentClassifierService.classify(text);

      if (intent.intent !== 'CREATE_TRANSACTION') {
        return {
          status: 'UNSUPPORTED',
          rawText: input.text,
        };
      }

      const entities =
        await this.aiTransactionEntityExtractorService.extract(text);

      if (entities.amount === undefined || entities.amount <= 0) {
        return {
          status: 'INVALID',
          rawText: input.text,
        };
      }

      if (
        entities.type !== 'INCOME' &&
        entities.type !== 'EXPENSE' &&
        entities.type !== 'TRANSFER'
      ) {
        return {
          status: 'UNSUPPORTED',
          rawText: input.text,
        };
      }

      if (!entities.description?.trim()) {
        return {
          status: 'INVALID',
          rawText: input.text,
        };
      }

      if (entities.type === 'TRANSFER') {
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
          transactionType: entities.type,

          amount: entities.amount,

          description: entities.description.trim(),

          categoryHint: entities.categoryHint ?? undefined,

          accountHint: entities.accountHint ?? undefined,

          transactionDate: undefined,

          confidence: intent.confidence,

          source: 'AI',
        },
      };
    } catch (error) {
      this.logger.warn(
        `AI Telegram transaction parsing failed for message=${input.messageId.toString()}: ${
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
