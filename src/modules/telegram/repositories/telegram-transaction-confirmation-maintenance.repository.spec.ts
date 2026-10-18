import { TelegramTransactionConfirmationStatus } from '../../../../generated/prisma/enums';

import { TelegramTransactionConfirmationMaintenanceRepository } from './telegram-transaction-confirmation-maintenance.repository';

describe('TelegramTransactionConfirmationMaintenanceRepository', () => {
  let repository: TelegramTransactionConfirmationMaintenanceRepository;

  let prisma: {
    telegramTransactionConfirmation: {
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      telegramTransactionConfirmation: {
        updateMany: jest.fn(),
      },
    };

    repository = new TelegramTransactionConfirmationMaintenanceRepository(
      prisma as any,
    );
  });

  it('recovers only stale PROCESSING confirmations', async () => {
    const staleBefore = new Date('2026-01-01T00:00:00.000Z');

    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 3,
    });

    await expect(repository.recoverStaleProcessing(staleBefore)).resolves.toBe(
      3,
    );

    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        status: TelegramTransactionConfirmationStatus.PROCESSING,
        updatedAt: { lte: staleBefore },
      },
      data: {
        status: TelegramTransactionConfirmationStatus.PENDING,
      },
    });
  });

  it('returns zero when no stale PROCESSING confirmations exist', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(repository.recoverStaleProcessing(new Date())).resolves.toBe(
      0,
    );
  });

  it('expires only PENDING confirmations whose expiry has passed', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 2,
    });

    await expect(repository.expirePending(now)).resolves.toBe(2);

    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        status: TelegramTransactionConfirmationStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: {
        status: TelegramTransactionConfirmationStatus.EXPIRED,
      },
    });
  });

  it('propagates database errors', async () => {
    const error = new Error('Database unavailable');

    prisma.telegramTransactionConfirmation.updateMany.mockRejectedValue(error);

    await expect(repository.expirePending(new Date())).rejects.toThrow(
      'Database unavailable',
    );
  });
});
