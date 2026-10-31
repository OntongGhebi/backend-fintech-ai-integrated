import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AIProviderHttpException } from '../errors/ai-provider-http.exception';
import { AIRetryService } from './ai-retry.service';

describe('AIRetryService', () => {
  let service: AIRetryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AIRetryService],
    }).compile();

    service = module.get<AIRetryService>(AIRetryService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns the result immediately when operation succeeds', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    await expect(service.execute(operation)).resolves.toBe('success');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['timeout', new Error('Request timeout')],
    ['connection reset', new Error('ECONNRESET')],
    ['network failure', new Error('Network error')],
  ])('retries transient %s errors', async (_label, error) => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success');

    await expect(
      service.execute(operation, {
        baseDelayMs: 1,
        maxDelayMs: 5,
      }),
    ).resolves.toBe('success');

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it.each([408, 429, 500, 502, 503, 504])(
    'retries upstream HTTP %i errors',
    async (status) => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new AIProviderHttpException(status))
        .mockResolvedValueOnce('success');

      await expect(
        service.execute(operation, {
          baseDelayMs: 1,
          maxDelayMs: 5,
        }),
      ).resolves.toBe('success');

      expect(operation).toHaveBeenCalledTimes(2);
    },
  );

  it.each([400, 401, 403, 404, 422])(
    'does not retry permanent upstream HTTP %i errors',
    async (status) => {
      const error = new AIProviderHttpException(status);
      const operation = jest.fn().mockRejectedValue(error);

      await expect(service.execute(operation)).rejects.toBe(error);

      expect(operation).toHaveBeenCalledTimes(1);
    },
  );

  it('does not retry application HTTP exceptions', async () => {
    const errors: HttpException[] = [
      new BadRequestException('Invalid request'),
      new UnauthorizedException('Unauthorized'),
      new ForbiddenException('Forbidden'),
      new HttpException('Application throttled request', 429),
    ];

    for (const error of errors) {
      const operation = jest.fn().mockRejectedValue(error);

      await expect(service.execute(operation)).rejects.toBe(error);

      expect(operation).toHaveBeenCalledTimes(1);
    }
  });

  it('does not retry unknown non-Error values', async () => {
    const operation = jest.fn().mockRejectedValue('unknown failure');

    await expect(service.execute(operation)).rejects.toBe('unknown failure');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After when it is longer than exponential backoff', async () => {
    jest.useFakeTimers();

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const operation = jest
      .fn()
      .mockRejectedValueOnce(new AIProviderHttpException(429, 4_000))
      .mockResolvedValueOnce('success');

    const resultPromise = service.execute(operation, {
      maxRetries: 1,
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
    });

    // Process the first attempt and its retry timer deterministically.
    await jest.advanceTimersByTimeAsync(4_000);

    await expect(resultPromise).resolves.toBe('success');

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 4_000);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('caps Retry-After to the configured safety maximum', async () => {
    jest.useFakeTimers();

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const operation = jest
      .fn()
      .mockRejectedValueOnce(new AIProviderHttpException(429, 120_000))
      .mockResolvedValueOnce('success');

    const resultPromise = service.execute(operation, {
      maxRetries: 1,
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
    });

    await jest.advanceTimersByTimeAsync(30_000);

    await expect(resultPromise).resolves.toBe('success');

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff and respects the maximum delay', async () => {
    jest.useFakeTimers();

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockResolvedValueOnce('success');

    const resultPromise = service.execute(operation, {
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 15,
    });

    // Executes both retry timers without waiting for real time.
    await jest.runAllTimersAsync();

    await expect(resultPromise).resolves.toBe('success');

    const retryDelays = setTimeoutSpy.mock.calls
      .map(([, delay]) => delay)
      .filter((delay): delay is number => typeof delay === 'number');

    expect(retryDelays).toEqual([10, 15]);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('stops after the configured retry count', async () => {
    jest.useFakeTimers();

    const error = new Error('Request timeout');
    const operation = jest.fn().mockRejectedValue(error);

    const resultPromise = service.execute(operation, {
      maxRetries: 2,
      baseDelayMs: 1,
      maxDelayMs: 5,
    });

    // Attach the rejection assertion before advancing timers.
    const rejectionAssertion = expect(resultPromise).rejects.toBe(error);

    await jest.runAllTimersAsync();
    await rejectionAssertion;

    // One initial attempt plus two retries.
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
