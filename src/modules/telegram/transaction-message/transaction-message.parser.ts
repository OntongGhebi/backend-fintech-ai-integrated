import { Injectable } from '@nestjs/common';

import {
  ParsedTransactionMessage,
  TransactionMessageInput,
  TransactionMessageParser,
} from './transaction-message.types';

type TransactionType = 'INCOME' | 'EXPENSE';

interface ParsedAmount {
  amount: number;
  rawAmount: string;
  startIndex: number;
  endIndex: number;
}

@Injectable()
export class BasicTransactionMessageParser implements TransactionMessageParser {
  private readonly expenseKeywords = [
    'beli',
    'bayar',
    'makan',
    'minum',
    'ongkos',
    'transport',
    'parkir',
    'pulsa',
    'belanja',
    'sewa',
  ];

  private readonly incomeKeywords = [
    'gaji',
    'bonus',
    'pendapatan',
    'dapat',
    'terima',
    'masuk',
    'freelance',
  ];

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

    const parsedAmount = this.extractAmount(text);

    if (!parsedAmount) {
      return {
        status: 'UNSUPPORTED',
        rawText: input.text,
      };
    }

    const transactionType = this.detectTransactionType(text);

    if (!transactionType) {
      return {
        status: 'UNSUPPORTED',
        rawText: input.text,
      };
    }

    const description = this.extractDescription(text, parsedAmount);

    if (!description) {
      return {
        status: 'INVALID',
        rawText: input.text,
      };
    }

    return {
      status: 'PARSED',
      rawText: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType,
        amount: parsedAmount.amount,
        description,
        source: 'DETERMINISTIC',
        confidence: 1,
      },
    };
  }

  private extractAmount(text: string): ParsedAmount | null {
    const matches = [
      ...text.matchAll(/(?:rp\.?|idr\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+)/gi),
    ];

    if (matches.length === 0) {
      return null;
    }

    const match = matches[matches.length - 1];

    const rawAmount = match[1];

    const amount = this.normalizeAmount(rawAmount);

    if (!Number.isFinite(amount)) {
      return null;
    }

    if (amount <= 0) {
      return null;
    }

    const fullMatch = match[0];

    const startIndex = match.index ?? -1;

    if (startIndex < 0) {
      return null;
    }

    const endIndex = startIndex + fullMatch.length;

    return {
      amount,
      rawAmount: fullMatch,
      startIndex,
      endIndex,
    };
  }

  private normalizeAmount(value: string): number {
    const normalized = value
      .replace(/[.,](?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.');

    return Number(normalized);
  }

  private detectTransactionType(text: string): TransactionType | null {
    const normalized = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = new Set(normalized.split(' '));

    if (this.incomeKeywords.some((keyword) => words.has(keyword))) {
      return 'INCOME';
    }

    if (this.expenseKeywords.some((keyword) => words.has(keyword))) {
      return 'EXPENSE';
    }

    return null;
  }

  private extractDescription(text: string, parsedAmount: ParsedAmount): string {
    const description = [
      text.slice(0, parsedAmount.startIndex),
      text.slice(parsedAmount.endIndex),
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return description;
  }
}
