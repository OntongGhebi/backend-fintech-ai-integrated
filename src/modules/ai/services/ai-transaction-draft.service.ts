import { Injectable } from '@nestjs/common';
import { AITransactionEntities } from '../types/ai-transaction.types';
import {
  AITransactionDraft,
  AITransactionDraftUnresolvedField,
} from '../types/ai-transaction-draft.types';
import { AITransactionResolutionResult } from '../types/ai-transaction-resolution.types';

@Injectable()
export class AITransactionDraftService {
  buildDraft(
    entities: AITransactionEntities,
    resolution: AITransactionResolutionResult,
  ): AITransactionDraft {
    const unresolvedFields = this.collectUnresolvedFields(entities, resolution);

    const ready = unresolvedFields.length === 0;

    return {
      type: entities.type,
      amount: entities.amount,
      description: entities.description,
      accountId: resolution.account.account?.id || null,
      categoryId: resolution.category.category?.id || null,
      destinationAccountId: resolution.destinationAccount.account?.id || null,
      currency: 'IDR',
      status: ready ? 'READY' : 'NEEDS_RESOLUTION',
      ready,
      unresolvedFields,
    };
  }

  private collectUnresolvedFields(
    entities: AITransactionEntities,
    resolution: AITransactionResolutionResult,
  ): AITransactionDraftUnresolvedField[] {
    const unresolvedFields: AITransactionDraftUnresolvedField[] = [];

    if (resolution.account.status !== 'RESOLVED') {
      unresolvedFields.push('account');
    }

    if (
      entities.type === 'TRANSFER' &&
      resolution.destinationAccount.status !== 'RESOLVED'
    ) {
      unresolvedFields.push('destinationAccount');
    }

    if (
      entities.type !== 'TRANSFER' &&
      resolution.category.status !== 'RESOLVED' &&
      resolution.category.status !== 'NOT_REQUESTED'
    ) {
      unresolvedFields.push('category');
    }

    return unresolvedFields;
  }
}
