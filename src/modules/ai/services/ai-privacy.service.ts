/* eslint-disable no-control-regex */
import { Injectable } from '@nestjs/common';

export interface AISanitizedProviderError {
  status: number;
  body: string;
}

@Injectable()
export class AIPrivacyService {
  private static readonly MAX_LOG_LENGTH = 1000;

  private static readonly SECRET_PATTERNS: readonly RegExp[] = [
    /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    /(?:api[_-]?key|apikey|access[_-]?token|secret|authorization)\s*[:=]\s*["']?[^"',\s}]+["']?/gi,
    /\bsk-[A-Za-z0-9_-]+\b/gi,
    /\b(?:token|password)\s*[:=]\s*["']?[^"',\s}]+["']?/gi,
  ];

  sanitizeProviderErrorBody(body: string): string {
    const normalized = body.replace(/\u0000/g, '').trim();

    if (!normalized) {
      return '[empty provider error body]';
    }

    const redacted = this.redactSecrets(normalized);

    if (redacted.length <= AIPrivacyService.MAX_LOG_LENGTH) {
      return redacted;
    }

    return `${redacted.slice(
      0,
      AIPrivacyService.MAX_LOG_LENGTH,
    )}...[truncated]`;
  }

  sanitizeLogMessage(message: string): string {
    const normalized = message.replace(/\u0000/g, '').trim();

    if (!normalized) {
      return '[empty log message]';
    }

    const redacted = this.redactSecrets(normalized);

    if (redacted.length <= AIPrivacyService.MAX_LOG_LENGTH) {
      return redacted;
    }

    return `${redacted.slice(
      0,
      AIPrivacyService.MAX_LOG_LENGTH,
    )}...[truncated]`;
  }

  validateResponseContent(content: string): string {
    const normalized = content.replace(/\u0000/g, '');

    if (!normalized.trim()) {
      throw new Error('AI provider returned an empty response');
    }

    if (normalized.length > 12_000) {
      throw new Error(
        'AI provider response exceeds the maximum allowed length',
      );
    }

    return normalized;
  }

  private redactSecrets(value: string): string {
    return AIPrivacyService.SECRET_PATTERNS.reduce(
      (result, pattern) => result.replace(pattern, '[REDACTED]'),
      value,
    );
  }
}
