import {
  AICompletionRequest,
  AICompletionResponse,
  AIProviderMetadata,
} from '../ai.types';

export interface AIProvider {
  getMetadata(): AIProviderMetadata;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}
