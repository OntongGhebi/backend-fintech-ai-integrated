import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AIProvider } from '../providers/ai-provider.interface';
import { AI_PROVIDER } from '../constants/ai.constants';
import {
  AICompletionRequest,
  AICompletionResponse,
  AIProviderMetadata,
} from '../types/ai.types';

@Injectable()
export class AIService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(AI_PROVIDER)
    private readonly provider: AIProvider,
  ) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('ai.enabled', false);
  }

  getProviderMetadata(): AIProviderMetadata {
    return this.provider.getMetadata();
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('AI service is disabled');
    }

    return this.provider.complete(request);
  }
}
