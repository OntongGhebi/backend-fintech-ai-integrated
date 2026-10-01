import {
  AICompletionRequest,
  AICompletionResponse,
  AIProviderMetadata,
} from '../types/ai.types';

export interface AIProvider {
  getMetadata(): AIProviderMetadata;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}
