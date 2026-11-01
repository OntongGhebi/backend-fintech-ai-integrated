import { Injectable } from '@nestjs/common';
import { AccountsRepository } from 'src/modules/accounts/repositories/accounts.repository';
import { CategoriesRepository } from 'src/modules/categories/repositories/categories.repository';
import { ResolvedTransactionIntent } from '../types/resolved-transaction-intent.types';
import { TransactionIntent } from '../types/transaction-intent.types';
import { TransactionIntentResolutionResult } from '../types/transaction-intent-resolution.types';

type AccountRecord = {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
};

type AccountLookupResult =
  | { status: 'RESOLVED'; account: AccountRecord }
  | { status: 'NEEDS_ACCOUNT'; message: string }
  | { status: 'NOT_FOUND'; message: string };

@Injectable()
export class TransactionIntentResolutionService {
  constructor(
    private readonly accountsRepository: AccountsRepository,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  async resolve(
    userId: string,
    input: TransactionIntent,
  ): Promise<TransactionIntentResolutionResult> {
    if (input.intent === 'TRANSFER') {
      return this.resolveTransfer(userId, input);
    }

    if (input.intent !== 'CREATE_TRANSACTION') {
      return {
        status: 'INVALID',
        message: 'Transaction intent is not supported',
      };
    }

    if (!input.transactionType) {
      return {
        status: 'INVALID',
        message: 'Transaction type is required',
      };
    }

    if (
      input.amount === undefined ||
      !Number.isFinite(input.amount) ||
      input.amount <= 0
    ) {
      return {
        status: 'INVALID',
        message: 'Transaction amount is invalid',
      };
    }

    if (!input.description?.trim()) {
      return {
        status: 'INVALID',
        message: 'Transaction description is required',
      };
    }

    if (!input.accountHint?.trim()) {
      return {
        status: 'NEEDS_ACCOUNT',
        message: 'A financial account is required for this transaction',
      };
    }

    const accountResult = await this.resolveAccount(userId, input.accountHint);

    if (accountResult.status !== 'RESOLVED') {
      return {
        status: accountResult.status,
        message: accountResult.message,
      };
    }

    const account = accountResult.account;

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

    if (input.categoryHint?.trim()) {
      const category = await this.categoriesRepository.findByNameAndUserId(
        input.categoryHint.trim(),
        userId,
      );

      if (!category) {
        return {
          status: 'NOT_FOUND',
          message: `Category "${input.categoryHint.trim()}" was not found`,
        };
      }

      if (!category.isActive) {
        return {
          status: 'INVALID',
          message: 'The selected category is inactive',
        };
      }

      if (category.type !== input.transactionType) {
        return {
          status: 'INVALID',
          message: `The selected category is not a ${input.transactionType.toLowerCase()} category`,
        };
      }

      categoryId = category.id;
    }

    return {
      status: 'RESOLVED',
      intent: this.baseResolved(input, {
        accountId: account.id,
        categoryId,
      }),
    };
  }

  private async resolveTransfer(
    userId: string,
    input: TransactionIntent,
  ): Promise<TransactionIntentResolutionResult> {
    if (
      input.amount === undefined ||
      !Number.isFinite(input.amount) ||
      input.amount <= 0
    ) {
      return {
        status: 'INVALID',
        message: 'Transfer amount is invalid',
      };
    }

    if (
      !input.sourceAccountHint?.trim() ||
      !input.destinationAccountHint?.trim()
    ) {
      return {
        status: 'NEEDS_ACCOUNT',
        message: 'Source and destination accounts are required',
      };
    }

    const [sourceResult, destinationResult] = await Promise.all([
      this.resolveAccount(userId, input.sourceAccountHint),
      this.resolveAccount(userId, input.destinationAccountHint),
    ]);

    if (sourceResult.status !== 'RESOLVED') {
      return {
        status: sourceResult.status,
        message: `Source account: ${sourceResult.message}`,
      };
    }

    if (destinationResult.status !== 'RESOLVED') {
      return {
        status: destinationResult.status,
        message: `Destination account: ${destinationResult.message}`,
      };
    }

    const source = sourceResult.account;
    const destination = destinationResult.account;

    if (source.id === destination.id) {
      return {
        status: 'INVALID',
        message: 'Source and destination accounts must be different',
      };
    }

    if (!source.isActive || !destination.isActive) {
      return {
        status: 'INVALID',
        message: 'Both transfer accounts must be active',
      };
    }

    if (source.currency !== 'IDR' || destination.currency !== 'IDR') {
      return {
        status: 'INVALID',
        message: 'Both transfer accounts must use IDR currency',
      };
    }

    return {
      status: 'RESOLVED',
      intent: this.baseResolved(input, {
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        sourceAccountName: source.name,
        destinationAccountName: destination.name,
      }),
    };
  }

  /**
   * Resolves an account using:
   * 1. Exact account-name matching.
   * 2. Case-insensitive bank/account alias matching.
   *
   * Alias matching only searches accounts owned by the current user.
   * Ambiguous matches are never selected automatically.
   */
  private async resolveAccount(
    userId: string,
    hint: string,
  ): Promise<AccountLookupResult> {
    const normalizedHint = hint.trim();

    const exactAccount = await this.accountsRepository.findByNameAndUserId(
      normalizedHint,
      userId,
    );

    if (exactAccount) {
      return {
        status: 'RESOLVED',
        account: exactAccount,
      };
    }

    const repository = this.accountsRepository as AccountsRepository & {
      findManyByUserId?: (id: string) => Promise<AccountRecord[]>;
    };

    if (typeof repository.findManyByUserId !== 'function') {
      return {
        status: 'NOT_FOUND',
        message: `Account "${normalizedHint}" was not found`,
      };
    }

    const accounts = await repository.findManyByUserId(userId);
    const matches = accounts.filter((account) =>
      this.accountNameMatchesHint(account.name, normalizedHint),
    );

    if (matches.length === 0) {
      return {
        status: 'NOT_FOUND',
        message: `Account "${normalizedHint}" was not found`,
      };
    }

    if (matches.length > 1) {
      return {
        status: 'NEEDS_ACCOUNT',
        message: `More than one account matches "${normalizedHint}". Please specify the full account name.`,
      };
    }

    return {
      status: 'RESOLVED',
      account: matches[0],
    };
  }

  private accountNameMatchesHint(accountName: string, hint: string): boolean {
    const normalizedName = this.normalizeAccountName(accountName);
    const normalizedHint = this.normalizeAccountName(hint);

    if (!normalizedName || !normalizedHint) {
      return false;
    }

    // Match exact normalized names or account names beginning with the hint.
    // Examples:
    // "bri"     -> "BRI Account"
    // "bca"     -> "BCA Main Account"
    // "mandiri" -> "Mandiri Account"
    return (
      normalizedName === normalizedHint ||
      normalizedName.startsWith(`${normalizedHint} `)
    );
  }

  private normalizeAccountName(value: string): string {
    return value
      .normalize('NFKC')
      .toLocaleLowerCase('id-ID')
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ');
  }

  private baseResolved(
    input: TransactionIntent,
    extra: Partial<ResolvedTransactionIntent>,
  ): ResolvedTransactionIntent {
    return {
      intent: input.intent,
      transactionType: input.transactionType,
      amount: input.amount,
      description: input.description?.trim(),
      transactionDate: input.transactionDate,
      confidence: input.confidence,
      source: input.source,
      processingSource: input.source === 'AI' ? 'AI' : 'DETERMINISTIC',
      originalIntent: input,
      ...extra,
    };
  }
}
