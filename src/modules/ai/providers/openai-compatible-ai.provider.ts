import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider } from './ai-provider.interface';
import {
  AICompletionRequest,
  AICompletionResponse,
  AICompletionUsage,
  AIProviderMetadata,
} from '../types/ai.types';

interface OpenAICompatibleMessage {
  role: 'system' | 'user' | 'assistant';
  content?: string | null;
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
}

@Injectable()
export class OpenAICompatibleAIProvider implements AIProvider {
  private readonly logger = new Logger(OpenAICompatibleAIProvider.name);

  constructor(private readonly configService: ConfigService) {}

  getMetadata(): AIProviderMetadata {
    return {
      provider: 'openai-compatible',
      model: this.getModel(),
    };
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const apiKey = this.configService.get<string>('ai.apiKey', '');

    const baseUrl = this.configService.get<string>('ai.baseUrl', '');

    const model = this.getModel();

    if (!apiKey) {
      throw new ServiceUnavailableException('AI API key is not configured');
    }

    if (!baseUrl) {
      throw new ServiceUnavailableException('AI base URL is not configured');
    }

    if (!model) {
      throw new ServiceUnavailableException('AI model is not configured');
    }

    const timeoutMs = this.configService.get<number>('ai.timeoutMs', 30_000);

    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.buildCompletionUrl(baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0,
          max_tokens: request.maxTokens,
          response_format:
            request.responseFormat === 'json'
              ? {
                  type: 'json_object',
                }
              : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();

        this.logger.error(
          `AI provider request failed: status=${response.status}, body=${errorBody}`,
        );

        throw new ServiceUnavailableException('AI provider request failed');
      }

      const data = (await response.json()) as OpenAICompatibleResponse;

      const content = data.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new ServiceUnavailableException(
          'AI provider returned an empty response',
        );
      }

      return {
        content,
        provider: 'openai-compatible',
        model: data.model ?? model,
        usage: this.mapUsage(data.usage),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`AI provider request timed out after ${timeoutMs}ms`);

        throw new ServiceUnavailableException('AI provider request timed out');
      }

      this.logger.error(
        'AI provider request failed unexpectedly',
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException('AI provider request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private getModel(): string {
    return this.configService.get<string>('ai.model', '');
  }

  private buildCompletionUrl(baseUrl: string): string {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

    if (normalizedBaseUrl.endsWith('chat/completions')) {
      return normalizedBaseUrl;
    }

    return `${normalizedBaseUrl}/chat/completions`;
  }

  private mapUsage(
    usage: OpenAICompatibleResponse['usage'] | undefined,
  ): AICompletionUsage | undefined {
    if (!usage) {
      return undefined;
    }

    const inputTokens = usage.prompt_tokens ?? 0;

    const outputTokens = usage.completion_tokens ?? 0;

    const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;

    return {
      inputTokens,
      outputTokens,
      totalTokens,
    };
  }
}
