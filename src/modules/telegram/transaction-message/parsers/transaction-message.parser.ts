import { Injectable } from '@nestjs/common';

import {
  ParsedTransactionMessage,
  TransactionMessageInput,
  TransactionMessageParser,
} from '../types/transaction-message.types';

type TransactionType = 'INCOME' | 'EXPENSE';

interface ParsedAmount {
  amount: number;
  rawAmount: string;
  startIndex: number;
  endIndex: number;
}

interface ParsedAccount {
  accountHint?: string;
  startIndex: number;
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
    'upah',
    'honor',
    'komisi',
    'untung',
    'hasil',
    'pemberian',
  ];

  /**
   * Income phrases are checked separately because some Indonesian
   * expressions consist of more than one word.
   */
  private readonly incomePhrases = [
    'di kasih',
    'dikasih',
    'di beri',
    'diberi',
    'di berikan',
    'diberikan',
    'di transfer',
    'ditransfer',
    'uang masuk',
    'hasil kerja',
    'hasil jual',
  ];

  /**
   * Account aliases supported when the user writes the account name
   * directly or after a connector.
   *
   * Examples:
   * - makan 25000 dari BCA
   * - beli pulsa 25000 pakai Mandiri
   * - beli pulsa pakai Mandiri 25000
   * - dapat upah 30000 ke Mandiri
   *
   * Custom account names are also supported after an explicit connector.
   */
  private readonly knownAccountNames: Array<{
    alias: string;
    displayName: string;
  }> = [
    { alias: 'bank central asia', displayName: 'Bank Central Asia' },
    { alias: 'bank rakyat indonesia', displayName: 'Bank Rakyat Indonesia' },
    { alias: 'bank negara indonesia', displayName: 'Bank Negara Indonesia' },
    { alias: 'bank mandiri', displayName: 'Bank Mandiri' },
    { alias: 'bank syariah indonesia', displayName: 'Bank Syariah Indonesia' },
    { alias: 'cimb niaga', displayName: 'CIMB Niaga' },
    { alias: 'permata bank', displayName: 'Permata Bank' },
    { alias: 'danamon', displayName: 'Danamon' },
    { alias: 'maybank', displayName: 'Maybank' },
    { alias: 'ocbc', displayName: 'OCBC' },
    { alias: 'panin', displayName: 'Panin' },
    { alias: 'btn', displayName: 'BTN' },
    { alias: 'bsi', displayName: 'BSI' },
    { alias: 'bri', displayName: 'BRI' },
    { alias: 'bca', displayName: 'BCA' },
    { alias: 'bni', displayName: 'BNI' },
    { alias: 'mandiri', displayName: 'Mandiri' },
    { alias: 'cimb', displayName: 'CIMB' },
    { alias: 'jago', displayName: 'Jago' },
    { alias: 'seabank', displayName: 'SeaBank' },
    { alias: 'blu', displayName: 'blu' },
    { alias: 'neobank', displayName: 'NeoBank' },
    { alias: 'dana', displayName: 'DANA' },
    { alias: 'ovo', displayName: 'OVO' },
    { alias: 'gopay', displayName: 'GoPay' },
    { alias: 'shopeepay', displayName: 'ShopeePay' },
    { alias: 'linkaja', displayName: 'LinkAja' },
    { alias: 'cash', displayName: 'Cash' },
    { alias: 'tunai', displayName: 'Tunai' },
  ];

  private readonly accountConnectors = ['dari', 'ke', 'pakai', 'menggunakan'];

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

    const parsedAccount = this.extractAccount(text, parsedAmount);

    const description = this.extractDescription(
      text,
      parsedAmount,
      parsedAccount,
    );

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
        ...(parsedAccount.accountHint
          ? { accountHint: parsedAccount.accountHint }
          : {}),
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

    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const fullMatch = match[0];
    const startIndex = match.index ?? -1;

    if (startIndex < 0) {
      return null;
    }

    return {
      amount,
      rawAmount: fullMatch,
      startIndex,
      endIndex: startIndex + fullMatch.length,
    };
  }

  private normalizeAmount(value: string): number {
    const normalized = value
      .replace(/[.,](?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.');

    return Number(normalized);
  }

  private extractAccount(
    text: string,
    parsedAmount: ParsedAmount,
  ): ParsedAccount {
    const normalizedText = text.toLocaleLowerCase('id-ID');

    const candidates = [...this.knownAccountNames].sort(
      (a, b) => b.alias.length - a.alias.length,
    );

    for (const account of candidates) {
      const escapedAlias = account.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const pattern = new RegExp(`(^|\\s)(${escapedAlias})(?=\\s|$)`, 'gi');

      for (const match of normalizedText.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        const accountStartIndex = match.index + match[1].length;
        const accountEndIndex = accountStartIndex + match[2].length;

        const prefix = normalizedText.slice(0, accountStartIndex);

        const connectorPattern = new RegExp(
          `\\s+(${this.accountConnectors.join('|')})\\s*$`,
          'i',
        );

        const connectorMatch = connectorPattern.exec(prefix);

        if (connectorMatch && connectorMatch.index !== undefined) {
          return {
            accountHint: account.displayName,
            startIndex: connectorMatch.index,
          };
        }

        const suffix = normalizedText.slice(accountEndIndex).trim();

        if (!suffix) {
          return {
            accountHint: account.displayName,
            startIndex: match.index,
          };
        }
      }
    }

    const connectorPattern = new RegExp(
      `\\s+(${this.accountConnectors.join('|')})\\s+(.+)$`,
      'i',
    );

    const explicitMatch = connectorPattern.exec(text);

    if (explicitMatch && explicitMatch.index !== undefined) {
      const connectorStartIndex = explicitMatch.index;

      let accountHint = explicitMatch[2].trim();

      accountHint = accountHint
        .replace(parsedAmount.rawAmount, '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
        .trim();

      if (accountHint) {
        return {
          accountHint,
          startIndex: connectorStartIndex,
        };
      }
    }

    return {
      startIndex: text.length,
    };
  }

  private detectTransactionType(text: string): TransactionType | null {
    const normalized = text
      .toLocaleLowerCase('id-ID')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = new Set(normalized.split(' '));

    // Check income phrases first, including expressions such as "di kasih".
    if (this.incomePhrases.some((phrase) => normalized.includes(phrase))) {
      return 'INCOME';
    }

    if (this.incomeKeywords.some((keyword) => words.has(keyword))) {
      return 'INCOME';
    }

    if (this.expenseKeywords.some((keyword) => words.has(keyword))) {
      return 'EXPENSE';
    }

    return null;
  }

  private extractDescription(
    text: string,
    parsedAmount: ParsedAmount,
    parsedAccount: ParsedAccount,
  ): string {
    const rangesToRemove: Array<{
      start: number;
      end: number;
    }> = [
      {
        start: parsedAmount.startIndex,
        end: parsedAmount.endIndex,
      },
    ];

    if (parsedAccount.accountHint) {
      rangesToRemove.push({
        start: parsedAccount.startIndex,
        end: text.length,
      });
    }

    // Remove ranges from right to left to preserve original indexes.
    let description = text;

    rangesToRemove
      .sort((a, b) => b.start - a.start)
      .forEach(({ start, end }) => {
        description = description.slice(0, start) + description.slice(end);
      });

    return description
      .replace(/\s+/g, ' ')
      .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
      .trim();
  }
}
