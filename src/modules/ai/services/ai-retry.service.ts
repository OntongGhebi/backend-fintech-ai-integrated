import { HttpException, Injectable, Logger } from '@nestjs/common';

import { AI_RETRY_CONFIG } from '../constants/ai-retry.constants';
import { AIProviderHttpException } from '../errors/ai-provider-http.exception';

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

@Injectable()
export class AIRetryService {
  private readonly logger = new Logger(AIRetryService.name);

  async execute<T>(
    operation: () => Promise<T>,
    options?: {
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
    },
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? AI_RETRY_CONFIG.MAX_RETRIES;
    const baseDelayMs = options?.baseDelayMs ?? AI_RETRY_CONFIG.BASE_DELAY_MS;
    const maxDelayMs = options?.maxDelayMs ?? AI_RETRY_CONFIG.MAX_DELAY_MS;

    let retryCount = 0;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (retryCount >= maxRetries || !this.isRetryableError(error)) {
          throw error;
        }

        retryCount += 1;

        const exponentialDelay = Math.min(
          baseDelayMs * 2 ** (retryCount - 1),
          maxDelayMs,
        );
        const retryAfterDelay = this.getRetryAfterDelay(error);
        const delay = Math.min(
          Math.max(exponentialDelay, retryAfterDelay ?? 0),
          AI_RETRY_CONFIG.MAX_RETRY_AFTER_MS,
        );

        this.logger.warn(
          `AI provider attempt failed. Retrying in ${delay}ms ` +
            `(retry ${retryCount}/${maxRetries})`,
        );

        await this.sleep(delay);
      }
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof AIProviderHttpException) {
      return RETRYABLE_HTTP_STATUSES.has(error.upstreamStatus);
    }

    // Other Nest HTTP exceptions are application/configuration errors unless
    // explicitly represented as an upstream provider exception above.
    if (error instanceof HttpException) {
      return false;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    const retryablePatterns = [
      'timeout',
      'timed out',
      'econnreset',
      'econnrefused',
      'socket hang up',
      'network error',
      'rate limit',
      'too many requests',
      'service unavailable',
      'temporarily unavailable',
      'internal server error',
      'bad gateway',
      'gateway timeout',
    ];

    return retryablePatterns.some((pattern) => message.includes(pattern));
  }

  private getRetryAfterDelay(error: unknown): number | undefined {
    if (!(error instanceof AIProviderHttpException)) {
      return undefined;
    }

    if (
      typeof error.retryAfterMs !== 'number' ||
      !Number.isFinite(error.retryAfterMs) ||
      error.retryAfterMs < 0
    ) {
      return undefined;
    }

    return error.retryAfterMs;
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
