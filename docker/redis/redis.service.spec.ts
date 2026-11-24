import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { RedisService } from './redis.service';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    status: 'ready',
    quit: jest.fn().mockResolvedValue('OK'),
    connect: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('RedisService', () => {
  let configService: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    } as unknown as ConfigService;
  });

  function createService(): RedisService {
    return new RedisService(configService);
  }

  function getMockClient() {
    const redisConstructor = Redis as unknown as jest.Mock;

    return redisConstructor.mock.results[
      redisConstructor.mock.results.length - 1
    ].value as {
      on: jest.Mock;
      once: jest.Mock;
      removeListener: jest.Mock;
      status: string;
      quit: jest.Mock;
      connect: jest.Mock;
    };
  }

  it('creates a Redis client with host configuration when REDIS_URL is absent', () => {
    const service = createService();

    expect(Redis).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 6379,
        db: 0,
        lazyConnect: true,
        maxRetriesPerRequest: null,
      }),
    );

    expect(service.getClient()).toBeDefined();
  });

  it('prefers REDIS_URL when it is configured', () => {
    jest.spyOn(configService, 'get').mockImplementation((key, defaultValue) => {
      if (key === 'redis.url') {
        return 'rediss://redis.example.com:6380';
      }

      return defaultValue;
    });

    createService();

    expect(Redis).toHaveBeenCalledWith(
      'rediss://redis.example.com:6380',
      expect.objectContaining({
        lazyConnect: true,
        maxRetriesPerRequest: null,
      }),
    );
  });

  it('does not log raw Redis connection error details', () => {
    const service = createService();
    const client = getMockClient();

    const loggerErrorSpy = jest
      .spyOn((service as unknown as { logger: Logger }).logger, 'error')
      .mockImplementation();

    const errorHandler = client.on.mock.calls.find(
      ([event]) => event === 'error',
    )?.[1] as ((error: Error) => void) | undefined;

    expect(errorHandler).toBeDefined();

    errorHandler?.(
      new Error(
        'connect ECONNREFUSED redis://admin:super-secret@private-host:6379',
      ),
    );

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Redis connection error (Error)',
    );

    const loggedMessage = loggerErrorSpy.mock.calls
      .map(([message]) => String(message))
      .join(' ');

    expect(loggedMessage).not.toContain('super-secret');
    expect(loggedMessage).not.toContain('private-host');
    expect(loggedMessage).not.toContain('redis://');
  });

  it('connects during module initialization when the client is waiting', async () => {
    const service = createService();
    const client = getMockClient();

    client.status = 'wait';

    await service.onModuleInit();

    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('closes the Redis connection during module destruction', async () => {
    const service = createService();
    const client = getMockClient();

    await service.onModuleDestroy();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('does not close an already-ended Redis client', async () => {
    const service = createService();
    const client = getMockClient();

    client.status = 'end';

    await service.onModuleDestroy();

    expect(client.quit).not.toHaveBeenCalled();
  });
});
