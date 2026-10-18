import { PrismaService } from 'src/database/prisma/prisma.service';
import { TelegramTransactionConfirmationStatus as Status } from '../../../../generated/prisma/enums';
import { TelegramTransactionConfirmationRepository } from './telegram-transaction-confirmation.repository';

describe('TelegramTransactionConfirmationRepository — recovery race conditions', () => {
  let repository: TelegramTransactionConfirmationRepository;

  const updateMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    updateMany.mockResolvedValue({ count: 0 });

    repository = new TelegramTransactionConfirmationRepository({
      telegramTransactionConfirmation: {
        updateMany,
      },
    } as unknown as PrismaService);
  });

  it('allows only the matching stale-processing update to report a recovery', async () => {
    const staleBefore = new Date('2026-10-18T10:00:00.000Z');

    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.all([
      repository.recoverStaleProcessingByChatId('chat-id', staleBefore),
      repository.recoverStaleProcessingByChatId('chat-id', staleBefore),
    ]);

    expect(results.sort()).toEqual([0, 1]);
    expect(updateMany).toHaveBeenCalledTimes(2);

    for (const [args] of updateMany.mock.calls) {
      expect(args).toEqual({
        where: {
          chatId: 'chat-id',
          status: Status.PROCESSING,
          updatedAt: { lte: staleBefore },
        },
        data: { status: Status.PENDING },
      });
    }
  });

  it('makes repeated expiry attempts harmless when no pending row matches', async () => {
    const now = new Date('2026-10-18T10:10:00.000Z');

    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.all([
      repository.expirePendingByChatId('chat-id', now),
      repository.expirePendingByChatId('chat-id', now),
    ]);

    expect(results.sort()).toEqual([0, 1]);
    expect(updateMany).toHaveBeenCalledTimes(2);

    for (const [args] of updateMany.mock.calls) {
      expect(args).toEqual({
        where: {
          chatId: 'chat-id',
          status: Status.PENDING,
          expiresAt: { lte: now },
        },
        data: { status: Status.EXPIRED },
      });
    }
  });

  it('does not restore a fresh PROCESSING confirmation', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const count = await repository.recoverStaleProcessingByChatId(
      'chat-id',
      new Date('2026-10-18T10:00:00.000Z'),
    );

    expect(count).toBe(0);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        chatId: 'chat-id',
        status: Status.PROCESSING,
        updatedAt: {
          lte: new Date('2026-10-18T10:00:00.000Z'),
        },
      },
      data: {
        status: Status.PENDING,
      },
    });
  });
});
