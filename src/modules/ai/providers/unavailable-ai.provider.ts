import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  AICompletionRequest,
  AICompletionResponse,
  AIProviderMetadata,
} from '../ai.types';
import { AIProvider } from './ai-provider.interface';

@Injectable()
export class UnavailableAIProvider implements AIProvider {
  getMetadata(): AIProviderMetadata {
    return {
      provider: 'none',
      model: '',
    };
  }

  complete(_request: AICompletionRequest): Promise<AICompletionResponse> {
    throw new ServiceUnavailableException('AI provider is not configured');
  }
}
