import { Injectable, Logger } from '@nestjs/common';
import {
  AI_USAGE_FEATURES,
  AIUsageFeature,
} from '../constants/ai-usage.constants';
import { AIUsageResult, RecordAIUsageInput } from '../types/ai-usage.types';
import { AIUsageRepository } from '../repositories/ai-usage.repository';
import { AICompletionResponse } from '../types/ai.types';

@Injectable()
export class AIUsageService {
  private readonly logger = new Logger(AIUsageService.name);

  constructor(private readonly aiUsageRepository: AIUsageRepository) {}

  async recordCompletion(
    userId: string,
    completion: AICompletionResponse,
    feature: AIUsageFeature = AI_USAGE_FEATURES.CHAT,
  ): Promise<AIUsageResult | null> {
    const input: RecordAIUsageInput = {
      userId,
      feature,
      completion,
    };

    try {
      return await this.aiUsageRepository.create(input);
    } catch (error) {
      this.logger.error(
        'Failed to persist AI usage',
        error instanceof Error ? error.stack : String(error),
      );

      return null;
    }
  }

  async findManyByUserId(
    userId: string,
    options?: {
      feature?: AIUsageFeature;
      limit?: number;
    },
  ) {
    return this.aiUsageRepository.findManyByUserId(userId, options);
  }
}
