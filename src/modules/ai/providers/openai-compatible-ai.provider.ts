import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AIProvider } from './ai-provider.interface';

import {
  AICompletionRequest,
  AICompletionResponse,
  AICompletionUsage,
  AIProviderMetadata,
} from '../types/ai.types';

import { AIPrivacyService } from '../services/ai-privacy.service';

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

  constructor(
    private readonly configService: ConfigService,
    private readonly aiPrivacyService: AIPrivacyService,
  ) {}

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
          messages: request.messages as OpenAICompatibleMessage[],
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

        const sanitizedErrorBody =
          this.aiPrivacyService.sanitizeProviderErrorBody(errorBody);

        this.logger.error(
          `AI provider request failed: status=${response.status}, body=${sanitizedErrorBody}`,
        );

        throw new ServiceUnavailableException('AI provider request failed');
      }

      const data = (await response.json()) as OpenAICompatibleResponse;

      const rawContent = data.choices?.[0]?.message?.content;

      if (typeof rawContent !== 'string') {
        throw new ServiceUnavailableException(
          'AI provider returned an empty response',
        );
      }

      let content: string;

      try {
        content = this.aiPrivacyService.validateResponseContent(rawContent);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('exceeds the maximum allowed length')
        ) {
          throw new ServiceUnavailableException(
            'AI provider response exceeds the maximum allowed length',
          );
        }

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

      const safeErrorMessage = this.aiPrivacyService.sanitizeLogMessage(
        error instanceof Error ? error.message : String(error),
      );

      this.logger.error(
        `AI provider request failed unexpectedly: ${safeErrorMessage}`,
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
