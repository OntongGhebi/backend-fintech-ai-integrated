import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AI_PROVIDER } from '../constants/ai.constants';
import {
  AI_USAGE_FEATURES,
  AIUsageFeature,
} from '../constants/ai-usage.constants';

import type { AIProvider } from '../providers/ai-provider.interface';
import {
  AICompletionRequest,
  AICompletionResponse,
  AIProviderMetadata,
} from '../types/ai.types';
import { AIRetryService } from './ai-retry.service';
import { AIUsageService } from './ai-usage.service';
import { AI_ERROR_MESSAGES } from '../constants/ai-error.constants';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(AI_PROVIDER)
    private readonly provider: AIProvider,
    private readonly aiRetryService: AIRetryService,
    private readonly aiUsageService: AIUsageService,
  ) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('ai.enabled', false);
  }

  getMetadata(): AIProviderMetadata {
    return this.provider.getMetadata();
  }

  async complete(
    request: AICompletionRequest,
    options?: {
      userId?: string;
      feature?: AIUsageFeature;
    },
  ): Promise<AICompletionResponse> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        AI_ERROR_MESSAGES.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const completion = await this.aiRetryService.execute(() =>
        this.provider.complete(request),
      );

      if (options?.userId) {
        await this.aiUsageService.recordCompletion(
          options.userId,
          completion,
          options.feature ?? AI_USAGE_FEATURES.CHAT,
        );
      }

      return completion;
    } catch (error) {
      this.logger.error(
        AI_ERROR_MESSAGES.PROVIDER_FAILED,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (error instanceof Error) {
        const normalizedMessage = error.message.toLowerCase();

        const isExplicitProviderFailure =
          /ai provider request failed|provider request failed|provider.*failed/i.test(
            normalizedMessage,
          );

        const isNetworkOrInfrastructureFailure =
          /connection refused|timed out|timeout|econnreset|econnrefused|socket hang up|network error|rate limit|too many requests|service unavailable|temporarily unavailable|internal server error|bad gateway|gateway timeout/i.test(
            normalizedMessage,
          );

        if (isExplicitProviderFailure) {
          throw error;
        }

        if (isNetworkOrInfrastructureFailure) {
          throw new ServiceUnavailableException(
            AI_ERROR_MESSAGES.SERVICE_UNAVAILABLE,
          );
        }
      }

      throw new ServiceUnavailableException(
        AI_ERROR_MESSAGES.SERVICE_UNAVAILABLE,
      );
    }
  }
}
