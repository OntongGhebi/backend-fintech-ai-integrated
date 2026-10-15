import { ThrottlerStorage } from '@nestjs/throttler';

export function createUnthrottledThrottlerStorage(): ThrottlerStorage {
  return {
    increment: () =>
      Promise.resolve({
        totalHits: 1,
        timeToExpire: 60_000,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
  };
}
