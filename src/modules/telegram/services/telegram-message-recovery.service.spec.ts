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

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should schedule automatic recovery and clear the interval on destroy', async () => {
    jest.useFakeTimers();

    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue({
      recovered: 2,
      failed: 0,
    });

    service.onModuleInit();

    await jest.advanceTimersByTimeAsync(
      TelegramMessageRecoveryService.RECOVERY_INTERVAL_MS,
    );

    expect(
      telegramMessageRepository.recoverStaleProcessing,
    ).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();

    await jest.advanceTimersByTimeAsync(
      TelegramMessageRecoveryService.RECOVERY_INTERVAL_MS,
    );

    expect(
      telegramMessageRepository.recoverStaleProcessing,
    ).toHaveBeenCalledTimes(1);
  });

  it('should not register multiple recovery intervals', async () => {
    jest.useFakeTimers();

    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue({
      recovered: 0,
      failed: 0,
    });

    service.onModuleInit();
    service.onModuleInit();

    await jest.advanceTimersByTimeAsync(
      TelegramMessageRecoveryService.RECOVERY_INTERVAL_MS,
    );

    expect(
      telegramMessageRepository.recoverStaleProcessing,
    ).toHaveBeenCalledTimes(1);
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

    expect(staleBefore.getTime()).toBeGreaterThanOrEqual(
      before - 5 * 60 * 1000,
    );

    expect(staleBefore.getTime()).toBeLessThanOrEqual(after - 5 * 60 * 1000);
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

    expect(staleBefore.getTime()).toBeGreaterThanOrEqual(before - 60_000);

    expect(staleBefore.getTime()).toBeLessThanOrEqual(after - 60_000);
  });

  it('should report recovered and failed messages', async () => {
    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue({
      recovered: 4,
      failed: 2,
    });

    await expect(service.recover()).resolves.toEqual({
      recovered: 4,
      failed: 2,
    });
  });

  it('should return zero counts when no stale messages exist', async () => {
    telegramMessageRepository.recoverStaleProcessing.mockResolvedValue({
      recovered: 0,
      failed: 0,
    });

    await expect(service.recover()).resolves.toEqual({
      recovered: 0,
      failed: 0,
    });
  });

  it.each([0, -1000, Infinity, NaN])(
    'should reject invalid lease timeout: %s',
    async (leaseTimeoutMs) => {
      await expect(service.recover({ leaseTimeoutMs })).rejects.toThrow(
        'leaseTimeoutMs must be a positive finite number',
      );

      expect(
        telegramMessageRepository.recoverStaleProcessing,
      ).not.toHaveBeenCalled();
    },
  );
});
