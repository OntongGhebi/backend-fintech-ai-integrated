import { Injectable } from '@nestjs/common';

import { AIIntentClassifierService } from './ai-intent-classifier.service';
import { AITransactionDraftService } from './ai-transaction-draft.service';
import { AITransactionEntityExtractorService } from './ai-transaction-entity-extractor.service';
import { AITransactionResolutionService } from './ai-transaction-resolution.service';
import { AITransactionValidationService } from './ai-transaction-validation.service';

import type { AIIntentClassification } from '../types/ai-intent.types';
import type { AITransactionDraft } from '../types/ai-transaction-draft.types';
import type { AITransactionEntities } from '../types/ai-transaction.types';
import type { AITransactionResolutionResult } from '../types/ai-transaction-resolution.types';

export type AITransactionIntelligenceStatus =
  'UNSUPPORTED' | 'NEEDS_INFORMATION' | 'READY' | 'INVALID' | 'ERROR';

export type AITransactionIntelligenceErrorCode =
  'AI_UNAVAILABLE' | 'AI_TIMEOUT' | 'AI_PROVIDER_ERROR';

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
  validationReason?: string;
  errorCode?: AITransactionIntelligenceErrorCode;
}

@Injectable()
export class AITransactionIntelligenceService {
  constructor(
    private readonly aiIntentClassifierService: AIIntentClassifierService,
    private readonly aiTransactionEntityExtractorService: AITransactionEntityExtractorService,
    private readonly aiTransactionResolutionService: AITransactionResolutionService,
    private readonly aiTransactionDraftService: AITransactionDraftService,
    private readonly aiTransactionValidationService: AITransactionValidationService,
  ) {}

  async analyze(
    input: AITransactionIntelligenceInput,
  ): Promise<AITransactionIntelligenceResult> {
    const normalizedText = input.text.trim();

    if (!normalizedText) {
      throw new Error('AI transaction intelligence text cannot be empty');
    }

    try {
      const intent =
        await this.aiIntentClassifierService.classify(normalizedText);

      if (intent.intent !== 'CREATE_TRANSACTION') {
        return {
          status: 'UNSUPPORTED',
          text: normalizedText,
          intent,
        };
      }

      const intentValidation =
        this.aiTransactionValidationService.validateIntent(intent);

      if (!intentValidation.valid) {
        return {
          status: 'INVALID',
          text: normalizedText,
          intent,
          validationReason: intentValidation.reason,
        };
      }

      const extractedEntities =
        await this.aiTransactionEntityExtractorService.extract(normalizedText);

      const entityValidation =
        this.aiTransactionValidationService.normalizeEntities(
          extractedEntities,
        );

      if (!entityValidation.valid || !entityValidation.value) {
        return {
          status: 'INVALID',
          text: normalizedText,
          intent,
          entities: extractedEntities,
          validationReason: entityValidation.reason,
        };
      }

      const entities = entityValidation.value;

      const resolution = await this.aiTransactionResolutionService.resolve(
        input.userId,
        entities,
      );

      const resolutionValidation =
        this.aiTransactionValidationService.validateResolution(
          entities,
          resolution,
        );

      if (!resolutionValidation.valid || !resolutionValidation.value) {
        return {
          status: 'INVALID',
          text: normalizedText,
          intent,
          entities,
          resolution,
          validationReason: resolutionValidation.reason,
        };
      }

      const draft = this.aiTransactionDraftService.buildDraft(
        entities,
        resolution,
      );

      const draftValidation = this.aiTransactionValidationService.validateDraft(
        entities,
        resolution,
        draft,
      );

      if (!draftValidation.valid || !draftValidation.value) {
        return {
          status: 'INVALID',
          text: normalizedText,
          intent,
          entities,
          resolution,
          draft,
          validationReason: draftValidation.reason,
        };
      }

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
    } catch (error) {
      return {
        status: 'ERROR',
        text: normalizedText,
        errorCode: this.mapErrorCode(error),
      };
    }
  }

  private mapErrorCode(error: unknown): AITransactionIntelligenceErrorCode {
    if (!(error instanceof Error)) {
      return 'AI_PROVIDER_ERROR';
    }

    const message = error.message.toLowerCase();

    if (
      message.includes('timed out') ||
      message.includes('timeout') ||
      message.includes('abort')
    ) {
      return 'AI_TIMEOUT';
    }

    if (message.includes('disabled') || message.includes('not configured')) {
      return 'AI_UNAVAILABLE';
    }

    return 'AI_PROVIDER_ERROR';
  }
}
