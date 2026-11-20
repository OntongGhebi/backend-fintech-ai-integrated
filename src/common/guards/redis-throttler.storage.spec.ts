import { RedisService } from '../../../docker/redis/redis.service';

import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;
  let evalMock: jest.Mock;
  let redisService: RedisService;

  beforeEach(() => {
    evalMock = jest.fn();

    redisService = {
      getClient: jest.fn().mockReturnValue({
        eval: evalMock,
      }),
    } as unknown as RedisService;

    storage = new RedisThrottlerStorage(redisService);
  });

  describe('increment', () => {
    it('should increment the counter and return an unblocked record', async () => {
      evalMock.mockResolvedValue([3, 45_000, 0, 0]);

      const result = await storage.increment(
        '127.0.0.1',
        60_000,
        100,
        60_000,
        'default',
      );

      expect(result).toEqual({
        totalHits: 3,
        timeToExpire: 45,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    });

    it('should return a blocked record when the limit is exceeded', async () => {
      evalMock.mockResolvedValue([6, 12_000, 1, 30_000]);

      const result = await storage.increment(
        '127.0.0.1',
        60_000,
        5,
        30_000,
        'default',
      );

      expect(result).toEqual({
        totalHits: 6,
        timeToExpire: 12,
        isBlocked: true,
        timeToBlockExpire: 30,
      });
    });

    it('should preserve the hit count while the client is blocked', async () => {
      evalMock.mockResolvedValue([6, 8_000, 1, 20_000]);

      const result = await storage.increment(
        '127.0.0.1',
        60_000,
        5,
        30_000,
        'default',
      );

      expect(result).toEqual({
        totalHits: 6,
        timeToExpire: 8,
        isBlocked: true,
        timeToBlockExpire: 20,
      });
    });

    it('should create namespaced Redis keys for each throttler', async () => {
      evalMock.mockResolvedValue([1, 60_000, 0, 0]);

      await storage.increment('127.0.0.1', 60_000, 100, 60_000, 'default');

      expect(evalMock).toHaveBeenCalledWith(
        expect.any(String),
        2,
        'fintech:rate-limit:{default:127.0.0.1}:count',
        'fintech:rate-limit:{default:127.0.0.1}:block',
        '60000',
        '100',
        '60000',
      );
    });

    it('should use a Redis hash tag to keep both keys in the same cluster slot', async () => {
      evalMock.mockResolvedValue([1, 60_000, 0, 0]);

      await storage.increment('127.0.0.1', 60_000, 100, 60_000, 'default');

      const [, , countKey, blockKey] = evalMock.mock.calls[0];

      const countHashTag = countKey.match(/\{([^}]+)\}/)?.[1];
      const blockHashTag = blockKey.match(/\{([^}]+)\}/)?.[1];

      expect(countHashTag).toBe('default:127.0.0.1');
      expect(blockHashTag).toBe(countHashTag);
    });

    it('should convert milliseconds to seconds using ceiling', async () => {
      evalMock.mockResolvedValue([2, 1_001, 0, 1_001]);

      const result = await storage.increment(
        '127.0.0.1',
        60_000,
        100,
        30_000,
        'default',
      );

      expect(result.timeToExpire).toBe(2);
      expect(result.timeToBlockExpire).toBe(2);
    });

    it('should return zero for expired or invalid TTL values', async () => {
      evalMock.mockResolvedValue([1, -2, 0, 0]);

      const result = await storage.increment(
        '127.0.0.1',
        60_000,
        100,
        30_000,
        'default',
      );

      expect(result.timeToExpire).toBe(0);
      expect(result.timeToBlockExpire).toBe(0);
    });

    it('should normalize invalid TTL and limit values', async () => {
      evalMock.mockResolvedValue([1, 60_000, 0, 0]);

      await storage.increment('127.0.0.1', 0, -10, 30_000, 'default');

      expect(evalMock).toHaveBeenCalledWith(
        expect.any(String),
        2,
        'fintech:rate-limit:{default:127.0.0.1}:count',
        'fintech:rate-limit:{default:127.0.0.1}:block',
        '1',
        '0',
        '30000',
      );
    });

    it('should preserve zero block duration', async () => {
      evalMock.mockResolvedValue([6, 12_000, 1, 12_000]);

      const result = await storage.increment(
        '127.0.0.1',
        60_000,
        5,
        0,
        'default',
      );

      expect(evalMock).toHaveBeenCalledWith(
        expect.any(String),
        2,
        expect.any(String),
        expect.any(String),
        '60000',
        '5',
        '0',
      );

      expect(result.isBlocked).toBe(true);
      expect(result.timeToBlockExpire).toBe(12);
    });

    it('should use an atomic Lua script for counter and blocking operations', async () => {
      evalMock.mockResolvedValue([1, 60_000, 0, 0]);

      await storage.increment('127.0.0.1', 60_000, 100, 30_000, 'default');

      const script = evalMock.mock.calls[0][0] as string;

      expect(script).toContain("redis.call('INCR', countKey)");
      expect(script).toContain("redis.call('PEXPIRE', countKey, ttl)");
      expect(script).toContain(
        "redis.call('SET', blockKey, '1', 'PX', blockDuration)",
      );
      expect(script).toContain("redis.call('PTTL', blockKey)");
      expect(script).toContain('if blockDuration < timeToExpire then');
    });

    it('should reject an invalid Redis response', async () => {
      evalMock.mockResolvedValue([1, 60_000]);

      await expect(
        storage.increment('127.0.0.1', 60_000, 100, 30_000, 'default'),
      ).rejects.toThrow('Invalid Redis throttler storage response');
    });

    it('should propagate Redis errors without falling back to memory storage', async () => {
      evalMock.mockRejectedValue(new Error('Redis connection unavailable'));

      await expect(
        storage.increment('127.0.0.1', 60_000, 100, 30_000, 'default'),
      ).rejects.toThrow('Redis connection unavailable');
    });
  });
});
