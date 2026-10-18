import { TelegramTransactionConfirmationRecoveryService } from './telegram-transaction-confirmation-recovery.service';

describe('TelegramTransactionConfirmationRecoveryService', () => {
  let service: TelegramTransactionConfirmationRecoveryService;

  let maintenanceRepository: {
    recoverStaleProcessing: jest.Mock;
    expirePending: jest.Mock;
  };

  beforeEach(() => {
    maintenanceRepository = {
      recoverStaleProcessing: jest.fn().mockResolvedValue(0),
      expirePending: jest.fn().mockResolvedValue(0),
    };

    service = new TelegramTransactionConfirmationRecoveryService(
      maintenanceRepository as any,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('recovers stale confirmations and expires pending confirmations', async () => {
    maintenanceRepository.recoverStaleProcessing.mockResolvedValue(2);
    maintenanceRepository.expirePending.mockResolvedValue(4);

    await expect(service.recover()).resolves.toEqual({
      recovered: 2,
      expired: 4,
    });

    expect(maintenanceRepository.recoverStaleProcessing).toHaveBeenCalledTimes(
      1,
    );

    expect(maintenanceRepository.expirePending).toHaveBeenCalledTimes(1);

    const [staleBefore] =
      maintenanceRepository.recoverStaleProcessing.mock.calls[0];
    const [now] = maintenanceRepository.expirePending.mock.calls[0];

    expect(staleBefore).toBeInstanceOf(Date);
    expect(now).toBeInstanceOf(Date);

    expect(staleBefore.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime() - staleBefore.getTime()).toBe(
      TelegramTransactionConfirmationRecoveryService.DEFAULT_LEASE_TIMEOUT_MS,
    );
  });

  it('recovers stale confirmations before expiring pending confirmations', async () => {
    const callOrder: string[] = [];

    maintenanceRepository.recoverStaleProcessing.mockImplementation(
      async () => {
        callOrder.push('recover');
        return 1;
      },
    );

    maintenanceRepository.expirePending.mockImplementation(async () => {
      callOrder.push('expire');
      return 1;
    });

    await service.recover();

    expect(callOrder).toEqual(['recover', 'expire']);
  });

  it('supports a custom lease timeout', async () => {
    await service.recover({ leaseTimeoutMs: 60_000 });

    const [staleBefore] =
      maintenanceRepository.recoverStaleProcessing.mock.calls[0];
    const [now] = maintenanceRepository.expirePending.mock.calls[0];

    expect(now.getTime() - staleBefore.getTime()).toBe(60_000);
  });

  it.each([0, -1, Infinity, NaN])(
    'rejects invalid lease timeout %s',
    async (leaseTimeoutMs) => {
      await expect(service.recover({ leaseTimeoutMs })).rejects.toThrow(
        'leaseTimeoutMs must be a positive finite number',
      );

      expect(
        maintenanceRepository.recoverStaleProcessing,
      ).not.toHaveBeenCalled();

      expect(maintenanceRepository.expirePending).not.toHaveBeenCalled();
    },
  );

  it('schedules recovery and clears the interval on destroy', async () => {
    jest.useFakeTimers();

    service.onModuleInit();

    await jest.advanceTimersByTimeAsync(
      TelegramTransactionConfirmationRecoveryService.RECOVERY_INTERVAL_MS,
    );

    expect(maintenanceRepository.recoverStaleProcessing).toHaveBeenCalledTimes(
      1,
    );

    expect(maintenanceRepository.expirePending).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();

    await jest.advanceTimersByTimeAsync(
      TelegramTransactionConfirmationRecoveryService.RECOVERY_INTERVAL_MS,
    );

    expect(maintenanceRepository.recoverStaleProcessing).toHaveBeenCalledTimes(
      1,
    );
  });

  it('does not register duplicate intervals', async () => {
    jest.useFakeTimers();

    service.onModuleInit();
    service.onModuleInit();

    await jest.advanceTimersByTimeAsync(
      TelegramTransactionConfirmationRecoveryService.RECOVERY_INTERVAL_MS,
    );

    expect(maintenanceRepository.recoverStaleProcessing).toHaveBeenCalledTimes(
      1,
    );
  });

  it('returns zero counts when there is nothing to recover or expire', async () => {
    await expect(service.recover()).resolves.toEqual({
      recovered: 0,
      expired: 0,
    });
  });
});
