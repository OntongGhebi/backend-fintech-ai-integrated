import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AI_PROVIDER } from '../constants/ai.constants';
import { AI_ERROR_MESSAGES } from '../constants/ai-error.constants';
import type { AIProvider } from '../providers/ai-provider.interface';
import {
  AICompletionRequest,
  AICompletionResponse,
  AIProviderMetadata,
} from '../types/ai.types';
import { AIRetryService } from './ai-retry.service';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(AI_PROVIDER)
    private readonly provider: AIProvider,
    private readonly aiRetryService: AIRetryService,
  ) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('ai.enabled', false);
  }

  getMetadata(): AIProviderMetadata {
    return this.provider.getMetadata();
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        AI_ERROR_MESSAGES.SERVICE_UNAVAILABLE,
      );
    }

    try {
      return await this.aiRetryService.execute(() =>
        this.provider.complete(request),
      );
    } catch (error) {
      this.logger.error(
        AI_ERROR_MESSAGES.PROVIDER_FAILED,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        AI_ERROR_MESSAGES.SERVICE_UNAVAILABLE,
      );
    }
  }
}
