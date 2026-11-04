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
import { AI_PROVIDER_CONFIG } from '../constants/ai-provider.constants';
import { AIProviderHttpException } from '../errors/ai-provider-http.exception';

interface OpenAICompatibleMessage {
  role: 'system' | 'user' | 'assistant';
  content?: string | null;
}

interface OpenAICompatibleContentPart {
  type?: string;
  text?: string;
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | OpenAICompatibleContentPart[] | null;
      refusal?: string | null;
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

    const fallbackModels = this.getFallbackModels(model);
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
          ...(fallbackModels.length > 0 ? { models: fallbackModels } : {}),
          messages: request.messages as OpenAICompatibleMessage[],
          temperature: request.temperature ?? 0,
          max_tokens: request.maxTokens,
          ...(request.responseFormat === 'json'
            ? {
                response_format: {
                  type: 'json_object',
                },
              }
            : {}),
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

        throw new AIProviderHttpException(
          response.status,
          this.parseRetryAfter(response.headers.get('retry-after')),
        );
      }

      const data = (await response.json()) as OpenAICompatibleResponse;
      const choice = data.choices?.[0];

      const rawContent = this.extractContent(choice?.message?.content);

      if (!rawContent.trim()) {
        this.logger.warn(
          [
            'AI provider returned an empty completion.',
            `model=${data.model ?? model},`,
            `finish_reason=${choice?.finish_reason ?? 'unknown'},`,
            `has_refusal=${Boolean(choice?.message?.refusal)},`,
            `output_tokens=${data.usage?.completion_tokens ?? 'unknown'}`,
          ].join(' '),
        );

        // Upstream berhasil merespons HTTP, tetapi tidak menghasilkan
        // completion yang dapat digunakan. Perlakukan sebagai upstream
        // failure agar AIRetryService dapat mencoba kembali.
        throw new AIProviderHttpException(502);
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
          'AI provider returned an invalid response',
        );
      }

      const actualModel = data.model ?? model;

      if (actualModel !== model) {
        this.logger.log(
          `AI model fallback succeeded: configured=${model}, actual=${actualModel}`,
        );
      }

      return {
        content,
        provider: 'openai-compatible',
        model: actualModel,
        usage: this.mapUsage(data.usage),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`AI provider request timed out after ${timeoutMs}ms`);

        throw new Error('AI provider request timed out');
      }

      const safeErrorMessage = this.aiPrivacyService.sanitizeLogMessage(
        error instanceof Error ? error.message : String(error),
      );

      this.logger.error(
        `AI provider request failed unexpectedly: ${safeErrorMessage}`,
      );

      if (error instanceof TypeError) {
        throw new Error('AI provider network error');
      }

      throw new ServiceUnavailableException('AI provider request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractContent(
    content: string | OpenAICompatibleContentPart[] | null | undefined,
  ): string {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .filter(
        (part) =>
          part && typeof part === 'object' && typeof part.text === 'string',
      )
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
  }

  private getModel(): string {
    return this.configService.get<string>('ai.model', '');
  }

  private getFallbackModels(primaryModel: string): string[] {
    const configuredModels = this.configService.get<string[]>(
      'ai.fallbackModels',
      [],
    );

    if (!Array.isArray(configuredModels)) {
      return [];
    }

    const uniqueModels = [
      ...new Set(
        configuredModels
          .filter(
            (model): model is string =>
              typeof model === 'string' && model.trim().length > 0,
          )
          .map((model) => model.trim())
          .filter((model) => model !== primaryModel),
      ),
    ];

    return uniqueModels.slice(0, AI_PROVIDER_CONFIG.MAX_FALLBACK_MODELS);
  }

  private parseRetryAfter(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }

    const seconds = Number(value);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.round(seconds * 1_000);
    }

    const retryAt = Date.parse(value);

    if (Number.isNaN(retryAt)) {
      return undefined;
    }

    return Math.max(0, retryAt - Date.now());
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
