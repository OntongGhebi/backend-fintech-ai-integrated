import { ConfigService } from '@nestjs/config';
import { OpenAICompatibleAIProvider } from './openai-compatible-ai.provider';
import { AIPrivacyService } from '../services/ai-privacy.service';

describe('OpenAICompatibleAIProvider model fallback', () => {
  let provider: OpenAICompatibleAIProvider;

  const configValues: Record<string, unknown> = {
    'ai.apiKey': 'test-openrouter-key',
    'ai.baseUrl': 'https://openrouter.ai/api/v1',
    'ai.model': 'google/gemma-4-31b-it:free',
    'ai.fallbackModels': [
      'xingchen-agi/xing4.0-29b-a4b:free',
      'google/gemma-4-26b-a4b-it:free',
      'google/gemma-4-31b-it:free',
    ],
    'ai.timeoutMs': 30_000,
  };

  const configService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      return configValues[key] ?? defaultValue;
    }),
  };

  const privacyService = {
    sanitizeProviderErrorBody: jest.fn((value: string) => value),
    sanitizeLogMessage: jest.fn((value: string) => value),
    validateResponseContent: jest.fn((value: string) => value),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    provider = new OpenAICompatibleAIProvider(
      configService as unknown as ConfigService,
      privacyService as unknown as AIPrivacyService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should send fallback models without duplicating the primary model', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'google/gemma-4-26b-a4b-it:free',
          choices: [
            {
              message: {
                content: 'Analisis keuangan berhasil.',
              },
            },
          ],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 15,
            total_tokens: 35,
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

    const result = await provider.complete({
      messages: [
        {
          role: 'user',
          content: 'Analisis pengeluaran saya.',
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(options?.body));

    expect(body.model).toBe('google/gemma-4-31b-it:free');
    expect(body.models).toEqual([
      'xingchen-agi/xing4.0-29b-a4b:free',
      'google/gemma-4-26b-a4b-it:free',
    ]);

    expect(result).toEqual({
      content: 'Analisis keuangan berhasil.',
      provider: 'openai-compatible',
      model: 'google/gemma-4-26b-a4b-it:free',
      usage: {
        inputTokens: 20,
        outputTokens: 15,
        totalTokens: 35,
      },
    });
  });

  it('should omit models when no fallback is configured', async () => {
    configValues['ai.fallbackModels'] = [];

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'google/gemma-4-31b-it:free',
          choices: [
            {
              message: {
                content: 'Halo!',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    await provider.complete({
      messages: [
        {
          role: 'user',
          content: 'Halo',
        },
      ],
    });

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(options?.body));

    expect(body.model).toBe('google/gemma-4-31b-it:free');
    expect(body).not.toHaveProperty('models');
  });
});
