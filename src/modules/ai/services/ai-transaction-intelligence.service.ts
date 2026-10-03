import { Injectable } from '@nestjs/common';

import { AIIntentClassifierService } from './ai-intent-classifier.service';
import { AITransactionDraftService } from './ai-transaction-draft.service';
import { AITransactionEntityExtractorService } from './ai-transaction-entity-extractor.service';
import { AITransactionResolutionService } from './ai-transaction-resolution.service';

import type { AIIntentClassification } from '../types/ai-intent.types';
import type { AITransactionEntities } from '../types/ai-transaction.types';
import type { AITransactionDraft } from '../types/ai-transaction-draft.types';
import type { AITransactionResolutionResult } from '../types/ai-transaction-resolution.types';

export type AITransactionIntelligenceStatus =
  'UNSUPPORTED' | 'NEEDS_INFORMATION' | 'READY';

export interface AITransactionIntelligenceInput {
  userId: string;
  text: string;
}

export interface AITransactionIntelligenceResult {
  status: AITransactionIntelligenceStatus;
  text: string;
  intent?: AIIntentClassification;
  entities?: AITransactionEntities;
  resolution?: AITransactionResolutionResult;
  draft?: AITransactionDraft;
}

@Injectable()
export class AITransactionIntelligenceService {
  constructor(
    private readonly aiIntentClassifierService: AIIntentClassifierService,
    private readonly aiTransactionEntityExtractorService: AITransactionEntityExtractorService,
    private readonly aiTransactionResolutionService: AITransactionResolutionService,
    private readonly aiTransactionDraftService: AITransactionDraftService,
  ) {}

  async analyze(
    input: AITransactionIntelligenceInput,
  ): Promise<AITransactionIntelligenceResult> {
    const normalizedText = input.text.trim();

    if (!normalizedText) {
      throw new Error('AI transaction intelligence text cannot be empty');
    }

    const intent =
      await this.aiIntentClassifierService.classify(normalizedText);

    if (intent.intent !== 'CREATE_TRANSACTION') {
      return {
        status: 'UNSUPPORTED',
        text: normalizedText,
        intent,
      };
    }

    const entities =
      await this.aiTransactionEntityExtractorService.extract(normalizedText);

    const resolution = await this.aiTransactionResolutionService.resolve(
      input.userId,
      entities,
    );

    const draft = this.aiTransactionDraftService.buildDraft(
      entities,
      resolution,
    );

    if (!draft.ready) {
      return {
        status: 'NEEDS_INFORMATION',
        text: normalizedText,
        intent,
        entities,
        resolution,
        draft,
      };
    }

    return {
      status: 'READY',
      text: normalizedText,
      intent,
      entities,
      resolution,
      draft,
    };
  }
}
