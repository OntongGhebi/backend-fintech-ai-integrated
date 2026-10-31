import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Represents an unsuccessful HTTP response from an upstream AI provider.
 * The public API remains a 503, while retry logic can inspect the real
 * upstream status and its Retry-After hint without exposing the provider body.
 */
export class AIProviderHttpException extends ServiceUnavailableException {
  constructor(
    readonly upstreamStatus: number,
    readonly retryAfterMs?: number,
  ) {
    super('AI provider request failed');
  }
}
