import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AIService } from './ai.service';
import {
  AI_TRANSACTION_ENTITY_SYSTEM_PROMPT,
  AI_TRANSACTION_ENTITY_TEMPERATURE,
} from '../constants/ai-transaction.constants';

import {
  AITransactionType,
  AITransactionEntities,
} from '../types/ai-transaction.types';

const SUPPORTED_TRANSACTION_TYPES: readonly AITransactionType[] = [
  'EXPENSE',
  'INCOME',
  'TRANSFER',
];

@Injectable()
export class AITransactionEntityExtractorService {
  constructor(private readonly aiService: AIService) {}

  async extract(content: string): Promise<AITransactionEntities> {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      throw new ServiceUnavailableException(
        'AI transaction entity extraction content cannot be empty',
      );
    }

    const response = await this.aiService.complete({
      messages: [
        {
          role: 'system',
          content: AI_TRANSACTION_ENTITY_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: normalizedContent,
        },
      ],
      temperature: AI_TRANSACTION_ENTITY_TEMPERATURE,
      responseFormat: 'json',
    });

    return this.parseEntities(response.content);
  }

  private parseEntities(content: string): AITransactionEntities {
    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new ServiceUnavailableException(
        'AI provider returned invalid transaction entities',
      );
    }

    if (!this.isRecord(parsed)) {
      throw new ServiceUnavailableException(
        'AI provider returned an invalid transaction entity structure',
      );
    }

    const type = parsed.type;

    if (!this.isSupportedTransactionType(type)) {
      throw new ServiceUnavailableException(
        'AI provider returned an unsupported transaction type',
      );
    }

    const amount = parsed.amount;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new ServiceUnavailableException(
        'AI provider returned an invalid transaction amount',
      );
    }

    const description = this.parseNullableString(
      parsed.description,
      'description',
    );

    const accountHint = this.parseNullableString(
      parsed.accountHint,
      'accountHint',
    );

    const categoryHint = this.parseNullableString(
      parsed.categoryHint,
      'categoryHint',
    );

    const destinationAccountHint = this.parseNullableString(
      parsed.destinationAccountHint,
      'destinationAccountHint',
    );

    if (type !== 'TRANSFER' && destinationAccountHint !== null) {
      throw new ServiceUnavailableException(
        'AI provider returned a destination account for a non-transfer transaction',
      );
    }

    return {
      type,
      amount,
      description,
      accountHint,
      categoryHint,
      destinationAccountHint,
    };
  }

  private parseNullableString(
    value: unknown,
    fieldName: string,
  ): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new ServiceUnavailableException(
        `AI provider returned an invalid ${fieldName} value`,
      );
    }

    const normalizedValue = value.trim();

    return normalizedValue || null;
  }

  private isSupportedTransactionType(
    value: unknown,
  ): value is AITransactionType {
    return (
      typeof value === 'string' &&
      SUPPORTED_TRANSACTION_TYPES.includes(value as AITransactionType)
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
