import { Injectable, Logger } from '@nestjs/common';

import { AI_RETRY_CONFIG } from '../constants/ai-retry.constants';

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

    let attempt = 0;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= maxRetries || !this.isRetryableError(error)) {
          throw error;
        }

        attempt += 1;

        const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);

        this.logger.warn(
          `AI provider attempt failed. Retrying in ${delay}ms ` +
            `(retry ${attempt}/${maxRetries})`,
        );

        await this.sleep(delay);
      }
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return true;
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

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
