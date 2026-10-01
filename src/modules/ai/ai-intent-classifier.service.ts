import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AIService } from './ai.service';

import { AIIntent, AIIntentClassification } from './ai-intent.types';
import {
  AI_INTENT_CLASSIFIER_TEMPERATURE,
  AI_INTENT_SYSTEM_PROMPT,
} from './ai-intent.constrants';

const SUPPORTED_AI_INTENTS: readonly AIIntent[] = [
  'CREATE_TRANSACTION',
  'QUERY_BALANCE',
  'QUERY_TRANSACTIONS',
  'QUERY_BUDGET',
  'GENERAL_CHAT',
  'UNKNOWN',
];

@Injectable()
export class AIIntentClassifierService {
  constructor(private readonly aiService: AIService) {}

  async classify(content: string): Promise<AIIntentClassification> {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      throw new Error('AI intent classification content cannot be empty');
    }

    const response = await this.aiService.complete({
      messages: [
        {
          role: 'system',
          content: AI_INTENT_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: normalizedContent,
        },
      ],
      temperature: AI_INTENT_CLASSIFIER_TEMPERATURE,
      responseFormat: 'json',
    });

    return this.parseClassification(response.content);
  }

  private parseClassification(content: string): AIIntentClassification {
    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new ServiceUnavailableException(
        'AI provider returned invalid intent classification',
      );
    }

    if (!this.isRecord(parsed)) {
      throw new ServiceUnavailableException(
        'AI provider returned an invalid intent classification structure',
      );
    }

    const intent = parsed.intent;

    if (!this.isSupportedIntent(intent)) {
      throw new ServiceUnavailableException(
        'AI provider returned an unsupported intent',
      );
    }

    const confidence = parsed.confidence;

    if (
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      throw new ServiceUnavailableException(
        'AI provider returned an invalid intent confidence',
      );
    }
    return { intent, confidence };
  }

  private isSupportedIntent(value: unknown): value is AIIntent {
    return (
      typeof value === 'string' &&
      SUPPORTED_AI_INTENTS.includes(value as AIIntent)
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
