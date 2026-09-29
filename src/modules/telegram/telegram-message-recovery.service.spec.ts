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

  it('should recover stale messages using the default lease timeout', async () => {
    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue(2);

    const before = Date.now();

    const result = await service.recover();

    const after = Date.now();

    expect(result).toBe(2);

    expect(
      telegramMessageRepository.recoverStaleProcessing,
    ).toHaveBeenCalledTimes(1);

    const staleBefore =
      telegramMessageRepository.recoverStaleProcessing.mock.calls[0][0];

    expect(staleBefore).toBeInstanceOf(Date);

    const staleBeforeTimestamp = staleBefore.getTime();

    const expectedMinimum = before - 5 * 60 * 1000;

    const expectedMaximum = after - 5 * 60 * 1000;

    expect(staleBeforeTimestamp).toBeGreaterThanOrEqual(expectedMinimum);

    expect(staleBeforeTimestamp).toBeLessThanOrEqual(expectedMaximum);
  });

  it('should use a custom lease timeout', async () => {
    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue(1);

    const before = Date.now();

    await service.recover({
      leaseTimeoutMs: 60_000,
    });

    const after = Date.now();

    const staleBefore =
      telegramMessageRepository.recoverStaleProcessing.mock.calls[0][0];

    const staleBeforeTimestamp = staleBefore.getTime();

    expect(staleBeforeTimestamp).toBeGreaterThanOrEqual(before - 60_000);

    expect(staleBeforeTimestamp).toBeLessThanOrEqual(after - 60_000);
  });

  it('should return zero when no stale messages are found', async () => {
    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue(0);

    const result = await service.recover();

    expect(result).toBe(0);
  });

  it('should reject a non-positive lease timeout', async () => {
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
});
