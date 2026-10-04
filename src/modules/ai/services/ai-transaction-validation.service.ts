import { Injectable } from '@nestjs/common';

import { AI_TRANSACTION_MIN_INTENT_CONFIDENCE } from '../constants/ai-validation.constants';

import type { AIIntentClassification } from '../types/ai-intent.types';
import type { AITransactionDraft } from '../types/ai-transaction-draft.types';
import type { AITransactionResolutionResult } from '../types/ai-transaction-resolution.types';
import type { AITransactionEntities } from '../types/ai-transaction.types';
import type {
  AITransactionValidationResult,
  //   AITransactionValidationTarget,
} from '../types/ai-transaction-validation.types';

@Injectable()
export class AITransactionValidationService {
  validateIntent(
    intent: AIIntentClassification,
  ): AITransactionValidationResult<AIIntentClassification> {
    if (intent.intent !== 'CREATE_TRANSACTION') {
      return this.invalid(
        'AI intent is not supported for transaction creation',
      );
    }

    if (
      !Number.isFinite(intent.confidence) ||
      intent.confidence < 0 ||
      intent.confidence > 1
    ) {
      return this.invalid('AI intent confidence is invalid');
    }

    if (intent.confidence < AI_TRANSACTION_MIN_INTENT_CONFIDENCE) {
      return this.invalid(
        `AI intent confidence is below the minimum threshold of ${AI_TRANSACTION_MIN_INTENT_CONFIDENCE}`,
      );
    }

    return {
      valid: true,
      value: intent,
    };
  }

  normalizeEntities(
    entities: AITransactionEntities,
  ): AITransactionValidationResult<AITransactionEntities> {
    const normalizedType = entities.type?.trim().toUpperCase();

    if (
      normalizedType !== 'EXPENSE' &&
      normalizedType !== 'INCOME' &&
      normalizedType !== 'TRANSFER'
    ) {
      return this.invalid('AI transaction type is invalid');
    }

    const amount = entities.amount;

    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(Math.trunc(amount))
    ) {
      return this.invalid('AI transaction amount is invalid');
    }

    const description = this.normalizeNullableString(entities.description);

    if (!description) {
      return this.invalid('AI transaction description is required');
    }

    const accountHint = this.normalizeNullableString(entities.accountHint);

    const categoryHint = this.normalizeNullableString(entities.categoryHint);

    const destinationAccountHint = this.normalizeNullableString(
      entities.destinationAccountHint,
    );

    if (normalizedType !== 'TRANSFER' && destinationAccountHint !== null) {
      return this.invalid(
        'Destination account is only allowed for transfer transactions',
      );
    }

    if (normalizedType === 'TRANSFER' && categoryHint !== null) {
      return this.invalid('Category is not allowed for transfer transactions');
    }

    if (normalizedType === 'TRANSFER' && !destinationAccountHint) {
      return this.invalid(
        'Transfer transaction requires a destination account',
      );
    }

    return {
      valid: true,
      value: {
        type: normalizedType,
        amount,
        description,
        accountHint,
        categoryHint,
        destinationAccountHint,
      },
    };
  }

  validateResolution(
    entities: AITransactionEntities,
    resolution: AITransactionResolutionResult,
  ): AITransactionValidationResult<AITransactionResolutionResult> {
    if (resolution.account.status === 'RESOLVED') {
      if (!resolution.account.account) {
        return this.invalid('Resolved source account is missing');
      }

      if (resolution.account.account.currency !== 'IDR') {
        return this.invalid('Resolved source account currency must be IDR');
      }
    }

    if (entities.type === 'TRANSFER') {
      if (resolution.destinationAccount.status !== 'RESOLVED') {
        return this.invalid('Transfer destination account must be resolved');
      }

      if (!resolution.destinationAccount.account) {
        return this.invalid('Resolved destination account is missing');
      }

      if (resolution.destinationAccount.account.currency !== 'IDR') {
        return this.invalid(
          'Resolved destination account currency must be IDR',
        );
      }

      if (
        resolution.account.status === 'RESOLVED' &&
        resolution.account.account &&
        resolution.destinationAccount.account.id ===
          resolution.account.account.id
      ) {
        return this.invalid(
          'Source and destination accounts must be different',
        );
      }

      if (resolution.category.status !== 'NOT_REQUESTED') {
        return this.invalid(
          'Transfer transaction must not have a category resolution',
        );
      }
    } else {
      if (resolution.destinationAccount.status !== 'NOT_REQUESTED') {
        return this.invalid(
          'Non-transfer transaction must not have a destination account',
        );
      }

      if (resolution.category.status === 'RESOLVED') {
        if (!resolution.category.category) {
          return this.invalid('Resolved category is missing');
        }

        const expectedCategoryType =
          entities.type === 'INCOME' ? 'INCOME' : 'EXPENSE';

        if (resolution.category.category.type !== expectedCategoryType) {
          return this.invalid(
            'Resolved category type does not match transaction type',
          );
        }
      }
    }

    return {
      valid: true,
      value: resolution,
    };
  }

  validateDraft(
    entities: AITransactionEntities,
    resolution: AITransactionResolutionResult,
    draft: AITransactionDraft,
  ): AITransactionValidationResult<AITransactionDraft> {
    if (draft.currency !== 'IDR') {
      return this.invalid('AI transaction draft currency must be IDR');
    }

    if (draft.type !== entities.type) {
      return this.invalid(
        'AI transaction draft type does not match extracted transaction type',
      );
    }

    if (draft.amount !== entities.amount) {
      return this.invalid(
        'AI transaction draft amount does not match extracted transaction amount',
      );
    }

    if (
      this.normalizeNullableString(draft.description) !==
      this.normalizeNullableString(entities.description)
    ) {
      return this.invalid(
        'AI transaction draft description does not match extracted description',
      );
    }

    const resolvedAccountId = resolution.account.account?.id ?? null;

    if (draft.accountId !== resolvedAccountId) {
      return this.invalid(
        'AI transaction draft account does not match account resolution',
      );
    }

    const resolvedCategoryId = resolution.category.category?.id ?? null;

    if (draft.categoryId !== resolvedCategoryId) {
      return this.invalid(
        'AI transaction draft category does not match category resolution',
      );
    }

    const resolvedDestinationAccountId =
      resolution.destinationAccount.account?.id ?? null;

    if (draft.destinationAccountId !== resolvedDestinationAccountId) {
      return this.invalid(
        'AI transaction draft destination account does not match account resolution',
      );
    }

    if (draft.ready !== resolution.ready) {
      return this.invalid(
        'AI transaction draft readiness does not match resolution readiness',
      );
    }

    if (draft.ready) {
      if (draft.status !== 'READY') {
        return this.invalid(
          'Ready AI transaction draft must have READY status',
        );
      }

      if (draft.unresolvedFields.length > 0) {
        return this.invalid(
          'Ready AI transaction draft cannot contain unresolved fields',
        );
      }
    } else if (draft.status !== 'NEEDS_RESOLUTION') {
      return this.invalid(
        'Unready AI transaction draft must have NEEDS_RESOLUTION status',
      );
    }

    if (entities.type === 'TRANSFER') {
      if (!draft.accountId) {
        return this.invalid('Transfer draft requires a source account');
      }

      if (!draft.destinationAccountId) {
        return this.invalid('Transfer draft requires a destination account');
      }

      if (draft.accountId === draft.destinationAccountId) {
        return this.invalid(
          'Transfer source and destination accounts must be different',
        );
      }

      if (draft.categoryId !== null) {
        return this.invalid('Transfer draft must not contain a category');
      }
    } else if (draft.destinationAccountId !== null) {
      return this.invalid(
        'Non-transfer draft must not contain a destination account',
      );
    }

    return {
      valid: true,
      value: draft,
    };
  }

  private normalizeNullableString(
    value: string | null | undefined,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');

    return normalized || null;
  }

  private invalid<T>(reason: string): AITransactionValidationResult<T> {
    return {
      valid: false,
      reason,
    };
  }
}
