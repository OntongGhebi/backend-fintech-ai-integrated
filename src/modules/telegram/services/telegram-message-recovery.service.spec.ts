import { TelegramMessageRecoveryService } from './telegram-message-recovery.service';

describe('TelegramMessageRecoveryService', () => {
  let service: TelegramMessageRecoveryService;

  let telegramMessageRepository: {
    recoverStaleProcessing: jest.Mock;
  };

  beforeEach(() => {
    telegramMessageRepository = {
      recoverStaleProcessing: jest.fn(),
    };

    service = new TelegramMessageRecoveryService(
      telegramMessageRepository as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should use the default lease timeout and maximum attempts', async () => {
    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue({
      recovered: 2,
      failed: 0,
    });

    const before = Date.now();

    const result = await service.recover();

    const after = Date.now();

    expect(result).toEqual({
      recovered: 2,
      failed: 0,
    });

    expect(
      telegramMessageRepository.recoverStaleProcessing,
    ).toHaveBeenCalledTimes(1);

    const [staleBefore, maxAttempts] =
      telegramMessageRepository.recoverStaleProcessing.mock.calls[0];

    expect(staleBefore).toBeInstanceOf(Date);

    expect(maxAttempts).toBe(3);

    const staleBeforeTimestamp = staleBefore.getTime();

    expect(staleBeforeTimestamp).toBeGreaterThanOrEqual(before - 5 * 60 * 1000);

    expect(staleBeforeTimestamp).toBeLessThanOrEqual(after - 5 * 60 * 1000);
  });

  it('should use a custom lease timeout', async () => {
    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue({
      recovered: 1,
      failed: 0,
    });

    const before = Date.now();

    await service.recover({
      leaseTimeoutMs: 60_000,
    });

    const after = Date.now();

    const [staleBefore, maxAttempts] =
      telegramMessageRepository.recoverStaleProcessing.mock.calls[0];

    expect(maxAttempts).toBe(3);

    const staleBeforeTimestamp = staleBefore.getTime();

    expect(staleBeforeTimestamp).toBeGreaterThanOrEqual(before - 60_000);

    expect(staleBeforeTimestamp).toBeLessThanOrEqual(after - 60_000);
  });

  it('should report recovered and failed messages', async () => {
    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue({
      recovered: 4,
      failed: 2,
    });

    const result = await service.recover();

    expect(result).toEqual({
      recovered: 4,
      failed: 2,
    });
  });

  it('should return zero counts when no stale messages exist', async () => {
    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue({
      recovered: 0,
      failed: 0,
    });

    const result = await service.recover();

    expect(result).toEqual({
      recovered: 0,
      failed: 0,
    });
  });

  it('should reject a zero lease timeout', async () => {
    await expect(
      service.recover({
        leaseTimeoutMs: 0,
      }),
    ).rejects.toThrow('leaseTimeoutMs must be a positive finite number');

    expect(
      telegramMessageRepository.recoverStaleProcessing,
    ).not.toHaveBeenCalled();
  });

  it('should reject a negative lease timeout', async () => {
    await expect(
      service.recover({
        leaseTimeoutMs: -1000,
      }),
    ).rejects.toThrow('leaseTimeoutMs must be a positive finite number');

    expect(
      telegramMessageRepository.recoverStaleProcessing,
    ).not.toHaveBeenCalled();
  });

  it('should reject an infinite lease timeout', async () => {
    await expect(
      service.recover({
        leaseTimeoutMs: Infinity,
      }),
    ).rejects.toThrow('leaseTimeoutMs must be a positive finite number');

    expect(
      telegramMessageRepository.recoverStaleProcessing,
    ).not.toHaveBeenCalled();
  });

  it('should reject NaN as a lease timeout', async () => {
    await expect(
      service.recover({
        leaseTimeoutMs: NaN,
      }),
    ).rejects.toThrow('leaseTimeoutMs must be a positive finite number');

    expect(
      telegramMessageRepository.recoverStaleProcessing,
    ).not.toHaveBeenCalled();
  });
});
