export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface AICompletionUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AICompletionResponse {
  content: string;
  provider: string;
  model: string;
  usage?: AICompletionUsage;
}

export interface AIProviderMetadata {
  provider: string;
  model: string;
}
