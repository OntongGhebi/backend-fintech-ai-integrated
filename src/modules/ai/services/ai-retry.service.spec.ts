import { Test, TestingModule } from '@nestjs/testing';

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
    jest.restoreAllMocks();
  });

  it('should return result immediately when operation succeeds', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    await expect(service.execute(operation)).resolves.toBe('success');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry timeout errors', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockResolvedValueOnce('success');

    await expect(
      service.execute(operation, {
        baseDelayMs: 1,
        maxDelayMs: 5,
      }),
    ).resolves.toBe('success');

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should retry connection reset errors', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce('success');

    await expect(
      service.execute(operation, {
        baseDelayMs: 1,
        maxDelayMs: 5,
      }),
    ).resolves.toBe('success');

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should retry rate limit errors', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('Too many requests'))
      .mockResolvedValueOnce('success');

    await expect(
      service.execute(operation, {
        baseDelayMs: 1,
        maxDelayMs: 5,
      }),
    ).resolves.toBe('success');

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should not retry non-transient errors', async () => {
    const error = new Error('Invalid API key');

    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      service.execute(operation, {
        baseDelayMs: 1,
        maxDelayMs: 5,
      }),
    ).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should stop after the configured retry count', async () => {
    const error = new Error('Request timeout');

    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      service.execute(operation, {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
      }),
    ).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should respect the maximum delay', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockResolvedValue('success');

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    await service.execute(operation, {
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 15,
    });

    const delays = setTimeoutSpy.mock.calls.map(([, delay]) => delay);

    expect(delays).toEqual([10, 15]);
  });
});
