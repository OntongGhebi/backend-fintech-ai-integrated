import { Injectable } from '@nestjs/common';
import type {
  ThrottlerStorage,
  ThrottlerStorageRecord,
} from '@nestjs/throttler';

import { RedisService } from '../../../docker/redis/redis.service';

const INCREMENT_RATE_LIMIT_SCRIPT = `
local countKey = KEYS[1]
local blockKey = KEYS[2]

local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local existingBlockTtl = redis.call('PTTL', blockKey)

if existingBlockTtl > 0 then
  local currentHits = tonumber(redis.call('GET', countKey) or '0')
  local countTtl = redis.call('PTTL', countKey)

  return {
    currentHits,
    math.max(0, countTtl),
    1,
    existingBlockTtl
  }
end

local totalHits = redis.call('INCR', countKey)

if totalHits == 1 then
  redis.call('PEXPIRE', countKey, ttl)
end

local timeToExpire = redis.call('PTTL', countKey)
local isBlocked = 0
local timeToBlockExpire = 0

if totalHits > limit then
  isBlocked = 1

  if blockDuration > 0 then
    redis.call('SET', blockKey, '1', 'PX', blockDuration)

    if blockDuration < timeToExpire then
      redis.call('PEXPIRE', countKey, blockDuration)
      timeToExpire = blockDuration
    end

    timeToBlockExpire = blockDuration
  else
    timeToBlockExpire = timeToExpire
  end
end

return {
  totalHits,
  math.max(0, timeToExpire),
  isBlocked,
  math.max(0, timeToBlockExpire)
}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const storageKey = `fintech:rate-limit:{${throttlerName}:${key}}`;
    const countKey = `${storageKey}:count`;
    const blockKey = `${storageKey}:block`;

    const normalizedTtl = Math.max(1, Math.floor(ttl));
    const normalizedLimit = Math.max(0, Math.floor(limit));
    const normalizedBlockDuration = Math.max(0, Math.floor(blockDuration));

    const result = (await this.redisService
      .getClient()
      .eval(
        INCREMENT_RATE_LIMIT_SCRIPT,
        2,
        countKey,
        blockKey,
        normalizedTtl.toString(),
        normalizedLimit.toString(),
        normalizedBlockDuration.toString(),
      )) as Array<number | string>;

    if (!Array.isArray(result) || result.length !== 4) {
      throw new Error('Invalid Redis throttler storage response');
    }

    const [rawTotalHits, rawTimeToExpire, rawIsBlocked, rawTimeToBlockExpire] =
      result;

    return {
      totalHits: Number(rawTotalHits),
      timeToExpire: this.toSeconds(rawTimeToExpire),
      isBlocked: Number(rawIsBlocked) === 1,
      timeToBlockExpire: this.toSeconds(rawTimeToBlockExpire),
    };
  }

  private toSeconds(value: number | string): number {
    const milliseconds = Number(value);

    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      return 0;
    }

    return Math.ceil(milliseconds / 1000);
  }
}
