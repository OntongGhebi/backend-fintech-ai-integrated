import { Injectable } from '@nestjs/common';

import { AccountsRepository } from 'src/modules/accounts/repositories/accounts.repository';
import { CategoriesRepository } from 'src/modules/categories/repositories/categories.repository';

import { ResolvedTransactionIntent } from '../types/resolved-transaction-intent.types';
import { TransactionIntent } from '../types/transaction-intent.types';
import { TransactionIntentResolutionResult } from '../types/transaction-intent-resolution.types';

@Injectable()
export class TransactionIntentResolutionService {
  constructor(
    private readonly accountsRepository: AccountsRepository,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  async resolve(
    userId: string,
    transactionIntent: TransactionIntent,
  ): Promise<TransactionIntentResolutionResult> {
    if (transactionIntent.intent !== 'CREATE_TRANSACTION') {
      return {
        status: 'INVALID',
        message: 'Transaction intent is not a create transaction intent',
      };
    }

    if (!transactionIntent.transactionType) {
      return {
        status: 'INVALID',
        message: 'Transaction type is required',
      };
    }

    if (
      transactionIntent.amount === undefined ||
      transactionIntent.amount <= 0
    ) {
      return {
        status: 'INVALID',
        message: 'Transaction amount is invalid',
      };
    }

    if (!transactionIntent.description?.trim()) {
      return {
        status: 'INVALID',
        message: 'Transaction description is required',
      };
    }

    if (!transactionIntent.accountHint?.trim()) {
      return {
        status: 'NEEDS_ACCOUNT',
        message: 'A financial account is required for this transaction',
      };
    }

    const accountHint = transactionIntent.accountHint.trim();

    // First, retain the existing exact-name lookup behavior.
    let account = await this.accountsRepository.findByNameAndUserId(
      accountHint,
      userId,
    );

    if (!account) {
      // If exact matching fails, search the user's own accounts
      // using complete normalized words.
      const accounts = await this.accountsRepository.findManyByUserId(userId);

      const matchingAccounts = accounts.filter((candidate) =>
        this.accountNameMatches(candidate.name, accountHint),
      );

      if (matchingAccounts.length > 1) {
        return {
          status: 'NEEDS_ACCOUNT',
          message:
            `More than one account matches "${accountHint}". ` +
            'Please specify the full account name.',
        };
      }

      account = matchingAccounts[0] ?? null;
    }

    if (!account) {
      return {
        status: 'NOT_FOUND',
        message: `Account "${accountHint}" was not found`,
      };
    }

    if (!account.isActive) {
      return {
        status: 'INVALID',
        message: 'The selected account is inactive',
      };
    }

    if (account.currency !== 'IDR') {
      return {
        status: 'INVALID',
        message: 'The selected account currency must be IDR',
      };
    }

    let categoryId: string | undefined;

    if (transactionIntent.categoryHint?.trim()) {
      const category = await this.categoriesRepository.findByNameAndUserId(
        transactionIntent.categoryHint.trim(),
        userId,
      );

      if (!category) {
        return {
          status: 'NOT_FOUND',
          message: `Category "${transactionIntent.categoryHint.trim()}" was not found`,
        };
      }

      if (!category.isActive) {
        return {
          status: 'INVALID',
          message: 'The selected category is inactive',
        };
      }

      if (
        transactionIntent.transactionType === 'INCOME' &&
        category.type !== 'INCOME'
      ) {
        return {
          status: 'INVALID',
          message: 'The selected category is not an income category',
        };
      }

      if (
        transactionIntent.transactionType === 'EXPENSE' &&
        category.type !== 'EXPENSE'
      ) {
        return {
          status: 'INVALID',
          message: 'The selected category is not an expense category',
        };
      }

      categoryId = category.id;
    }

    const resolvedIntent: ResolvedTransactionIntent = {
      intent: transactionIntent.intent,
      transactionType: transactionIntent.transactionType,
      amount: transactionIntent.amount,
      description: transactionIntent.description.trim(),
      accountId: account.id,
      categoryId,
      transactionDate: transactionIntent.transactionDate,
      confidence: transactionIntent.confidence,
      source: transactionIntent.source,
      processingSource:
        transactionIntent.source === 'AI' ? 'AI' : 'DETERMINISTIC',
      originalIntent: transactionIntent,
    };

    return {
      status: 'RESOLVED',
      intent: resolvedIntent,
    };
  }

  /**
   * Matches account hints against complete words in account names.
   *
   * Examples:
   * - "bri" matches "BRI Account"
   * - "bca" matches "BCA Main Account"
   * - "mandiri" matches "Mandiri Account"
   *
   * Matching is restricted to the accounts returned for the
   * authenticated user by AccountsRepository.
   */
  private accountNameMatches(
    accountName: string,
    accountHint: string,
  ): boolean {
    const normalize = (value: string): string[] =>
      value
        .normalize('NFKC')
        .toLocaleLowerCase('id-ID')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    const accountWords = new Set(normalize(accountName));
    const hintWords = normalize(accountHint);

    if (hintWords.length === 0) {
      return false;
    }

    return hintWords.every((word) => accountWords.has(word));
  }
}
