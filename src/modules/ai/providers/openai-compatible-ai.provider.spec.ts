import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OpenAICompatibleAIProvider } from './openai-compatible-ai.provider';
import { AIPrivacyService } from '../services/ai-privacy.service';

describe('OpenAICompatibleAIProvider', () => {
  let provider: OpenAICompatibleAIProvider;

  const configServiceMock = {
    get: jest.fn(),
  };

  let privacyService: AIPrivacyService;

  beforeEach(() => {
    jest.clearAllMocks();

    privacyService = new AIPrivacyService();

    provider = new OpenAICompatibleAIProvider(
      configServiceMock as unknown as ConfigService,
      privacyService,
    );
  });

  describe('getMetadata', () => {
    it('should return provider metadata', () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.model') {
            return 'test-model';
          }

          return fallback;
        },
      );

      expect(provider.getMetadata()).toEqual({
        provider: 'openai-compatible',
        model: 'test-model',
      });
    });
  });

  describe('complete', () => {
    const request = {
      messages: [
        {
          role: 'user' as const,
          content: 'Halo',
        },
      ],
    };

    it('should reject when API key is missing', async () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.apiKey') {
            return '';
          }

          return fallback;
        },
      );

      await expect(provider.complete(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('should reject when base URL is missing', async () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.apiKey') {
            return 'test-api-key';
          }

          if (key === 'ai.baseUrl') {
            return '';
          }

          return fallback;
        },
      );

      await expect(provider.complete(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('should reject when model is missing', async () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.apiKey') {
            return 'test-api-key';
          }

          if (key === 'ai.baseUrl') {
            return 'https://example.com/v1';
          }

          if (key === 'ai.model') {
            return '';
          }

          return fallback;
        },
      );

      await expect(provider.complete(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('should parse a successful provider response', async () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.apiKey') {
            return 'test-api-key';
          }

          if (key === 'ai.baseUrl') {
            return 'https://example.com/v1';
          }

          if (key === 'ai.model') {
            return 'test-model';
          }

          if (key === 'ai.timeoutMs') {
            return 30_000;
          }

          return fallback;
        },
      );

      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'test-model',
            choices: [
              {
                message: {
                  content: '{"intent":"CREATE_TRANSACTION"}',
                },
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      await expect(provider.complete(request)).resolves.toEqual({
        content: '{"intent":"CREATE_TRANSACTION"}',
        provider: 'openai-compatible',
        model: 'test-model',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];

      expect(url).toBe('https://example.com/v1/chat/completions');

      expect(options?.method).toBe('POST');

      expect(options?.headers).toEqual({
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      });

      fetchMock.mockRestore();
    });

    it('should normalize a base URL that already contains chat completions', async () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.apiKey') {
            return 'test-api-key';
          }

          if (key === 'ai.baseUrl') {
            return 'https://example.com/v1/chat/completions';
          }

          if (key === 'ai.model') {
            return 'test-model';
          }

          if (key === 'ai.timeoutMs') {
            return 30_000;
          }

          return fallback;
        },
      );

      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'test-model',
            choices: [
              {
                message: {
                  content: 'OK',
                },
              },
            ],
          }),
          {
            status: 200,
          },
        ),
      );

      await provider.complete(request);

      const [url] = fetchMock.mock.calls[0];

      expect(url).toBe('https://example.com/v1/chat/completions');

      fetchMock.mockRestore();
    });

    it('should reject unsuccessful provider responses', async () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.apiKey') {
            return 'test-api-key';
          }

          if (key === 'ai.baseUrl') {
            return 'https://example.com/v1';
          }

          if (key === 'ai.model') {
            return 'test-model';
          }

          return fallback;
        },
      );

      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Unauthorized',
            },
          }),
          {
            status: 401,
          },
        ),
      );

      await expect(provider.complete(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      fetchMock.mockRestore();
    });

    it('should not expose secrets from provider error bodies', async () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.apiKey') {
            return 'test-api-key';
          }

          if (key === 'ai.baseUrl') {
            return 'https://example.com/v1';
          }

          if (key === 'ai.model') {
            return 'test-model';
          }

          return fallback;
        },
      );

      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message:
                'Authorization: Bearer leaked-secret-token api_key=sk-secret-value',
            },
          }),
          {
            status: 401,
          },
        ),
      );

      const loggerErrorSpy = jest
        .spyOn((provider as any).logger, 'error')
        .mockImplementation(() => undefined);

      await expect(provider.complete(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      const logMessage = loggerErrorSpy.mock.calls[0][0];

      expect(logMessage).not.toContain('leaked-secret-token');

      expect(logMessage).not.toContain('sk-secret-value');

      expect(logMessage).toContain('[REDACTED]');

      loggerErrorSpy.mockRestore();
      fetchMock.mockRestore();
    });

    it('should reject an empty provider response', async () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.apiKey') {
            return 'test-api-key';
          }

          if (key === 'ai.baseUrl') {
            return 'https://example.com/v1';
          }

          if (key === 'ai.model') {
            return 'test-model';
          }

          return fallback;
        },
      );

      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '',
                },
              },
            ],
          }),
          {
            status: 200,
          },
        ),
      );

      await expect(provider.complete(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      fetchMock.mockRestore();
    });

    it('should reject an excessively large provider response', async () => {
      configServiceMock.get.mockImplementation(
        (key: string, fallback: string) => {
          if (key === 'ai.apiKey') {
            return 'test-api-key';
          }

          if (key === 'ai.baseUrl') {
            return 'https://example.com/v1';
          }

          if (key === 'ai.model') {
            return 'test-model';
          }

          return fallback;
        },
      );

      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: 'a'.repeat(12_001),
                },
              },
            ],
          }),
          {
            status: 200,
          },
        ),
      );

      await expect(provider.complete(request)).rejects.toThrow(
        'AI provider response exceeds the maximum allowed length',
      );

      fetchMock.mockRestore();
    });
  });
});
