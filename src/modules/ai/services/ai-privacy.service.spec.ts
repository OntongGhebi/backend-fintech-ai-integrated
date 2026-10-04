import { AIPrivacyService } from './ai-privacy.service';

describe('AIPrivacyService', () => {
  let service: AIPrivacyService;

  beforeEach(() => {
    service = new AIPrivacyService();
  });

  describe('sanitizeProviderErrorBody', () => {
    it('should sanitize empty provider error bodies', () => {
      expect(service.sanitizeProviderErrorBody('')).toBe(
        '[empty provider error body]',
      );
    });

    it('should redact bearer tokens', () => {
      const result = service.sanitizeProviderErrorBody(
        'Authorization: Bearer super-secret-token',
      );

      expect(result).not.toContain('super-secret-token');

      expect(result).toContain('[REDACTED]');
    });

    it('should redact API keys', () => {
      const result = service.sanitizeProviderErrorBody(
        'api_key=sk-test-secret-key',
      );

      expect(result).not.toContain('sk-test-secret-key');

      expect(result).toContain('[REDACTED]');
    });

    it('should redact access tokens', () => {
      const result = service.sanitizeProviderErrorBody(
        'access_token=very-secret-token',
      );

      expect(result).not.toContain('very-secret-token');

      expect(result).toContain('[REDACTED]');
    });

    it('should redact password values', () => {
      const result = service.sanitizeProviderErrorBody(
        'password=super-secret-password',
      );

      expect(result).not.toContain('super-secret-password');

      expect(result).toContain('[REDACTED]');
    });

    it('should remove null bytes', () => {
      const result = service.sanitizeProviderErrorBody(
        'provider-error\u0000-message',
      );

      expect(result).toBe('provider-error-message');
    });

    it('should truncate very long provider errors', () => {
      const result = service.sanitizeProviderErrorBody('a'.repeat(5000));

      expect(result.length).toBeLessThan(1100);
      expect(result).toContain('[truncated]');
    });
  });

  describe('sanitizeLogMessage', () => {
    it('should sanitize sensitive information from logs', () => {
      const result = service.sanitizeLogMessage(
        'request failed apiKey=super-secret',
      );

      expect(result).not.toContain('super-secret');

      expect(result).toContain('[REDACTED]');
    });

    it('should truncate long log messages', () => {
      const result = service.sanitizeLogMessage('x'.repeat(5000));

      expect(result).toContain('[truncated]');
      expect(result.length).toBeLessThan(1100);
    });

    it('should return a safe fallback for empty messages', () => {
      expect(service.sanitizeLogMessage('   ')).toBe('[empty log message]');
    });
  });

  describe('validateResponseContent', () => {
    it('should return normalized response content', () => {
      expect(service.validateResponseContent('hello\u0000world')).toBe(
        'helloworld',
      );
    });

    it('should reject an empty response', () => {
      expect(() => service.validateResponseContent('   ')).toThrow(
        'AI provider returned an empty response',
      );
    });

    it('should reject an excessively large response', () => {
      expect(() => service.validateResponseContent('a'.repeat(12_001))).toThrow(
        'AI provider response exceeds the maximum allowed length',
      );
    });

    it('should accept a response at the maximum length', () => {
      expect(service.validateResponseContent('a'.repeat(12_000))).toHaveLength(
        12_000,
      );
    });
  });
});
