import { ConfigService } from '@nestjs/config';

import { AIProviderHttpException } from '../errors/ai-provider-http.exception';
import { AIPrivacyService } from '../services/ai-privacy.service';
import { OpenAICompatibleAIProvider } from './openai-compatible-ai.provider';

describe('OpenAICompatibleAIProvider upstream retry metadata', () => {
  const configValues: Record<string, unknown> = {
    'ai.apiKey': 'test-openrouter-key',
    'ai.baseUrl': 'https://openrouter.ai/api/v1',
    'ai.model': 'google/gemma-4-31b-it:free',
    'ai.fallbackModels': [],
    'ai.timeoutMs': 30_000,
  };

  let provider: OpenAICompatibleAIProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        return configValues[key] ?? defaultValue;
      }),
    };

    provider = new OpenAICompatibleAIProvider(
      configService as unknown as ConfigService,
      new AIPrivacyService(),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves upstream status and parses Retry-After seconds', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
        status: 429,
        headers: { 'Retry-After': '2' },
      }),
    );

    let thrown: unknown;
    try {
      await provider.complete({
        messages: [{ role: 'user', content: 'Halo' }],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AIProviderHttpException);
    expect(thrown).toMatchObject({
      upstreamStatus: 429,
      retryAfterMs: 2_000,
    });
    expect((thrown as Error).message).toBe('AI provider request failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('limits OpenRouter fallback models to three entries', async () => {
    configValues['ai.fallbackModels'] = [
      'fallback/model-one',
      'fallback/model-two',
      'fallback/model-three',
      'google/gemma-4-31b-it:free',
    ];

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'google/gemma-4-31b-it:free',
          choices: [{ message: { content: 'Halo!' } }],
        }),
        { status: 200 },
      ),
    );

    await provider.complete({
      messages: [{ role: 'user', content: 'Halo' }],
    });

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(options?.body));

    expect(body.models).toEqual([
      'fallback/model-one',
      'fallback/model-two',
      'fallback/model-three',
    ]);
    expect(body.models).toHaveLength(3);
  });

  it('does not expose the raw upstream error body in the exception', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'private provider diagnostic' } }),
          { status: 400 },
        ),
      );

    let thrown: unknown;
    try {
      await provider.complete({
        messages: [{ role: 'user', content: 'Halo' }],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AIProviderHttpException);
    expect((thrown as Error).message).toBe('AI provider request failed');
    expect((thrown as Error).message).not.toContain(
      'private provider diagnostic',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
