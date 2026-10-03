import { AICompletionResponse } from './ai.types';

export interface RecordAIUsageInput {
  userId: string;
  feature: string;
  completion: AICompletionResponse;
}

export interface AIUsageResult {
  id: string;
  userId: string;
  feature: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: unknown;
  createdAt: Date;
}
