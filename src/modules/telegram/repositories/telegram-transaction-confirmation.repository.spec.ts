import { Prisma } from '../../../../generated/prisma/client';
import {
  TelegramTransactionConfirmationStatus as Status,
  TelegramTransactionConfirmationStatus,
} from '../../../../generated/prisma/enums';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { TelegramTransactionConfirmationRepository } from './telegram-transaction-confirmation.repository';

describe('TelegramTransactionConfirmationRepository', () => {
  let repository: TelegramTransactionConfirmationRepository;

  let prisma: {
    telegramTransactionConfirmation: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
    transaction: {
      update: jest.Mock;
    };
  };

  const now = new Date('2026-10-17T10:00:00.000Z');

  const intent = {
    intent: 'CREATE_TRANSACTION',
    transactionType: 'EXPENSE',
    amount: 25000,
    description: 'beli makan',
    accountId: 'account-id',
    source: 'DETERMINISTIC',
    confidence: 1,
    originalIntent: {
      intent: 'CREATE_TRANSACTION',
      transactionType: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
      accountHint: 'BCA',
      source: 'DETERMINISTIC',
      confidence: 1,
    },
  };

  const record = (overrides: Record<string, unknown> = {}) => ({
    id: 'confirmation-id',
    userId: 'user-id',
    chatId: 'chat-id',
    sourceMessageId: 'message-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: BigInt(123456),
    intent,
    status: Status.PENDING,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    transaction: null,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      telegramTransactionConfirmation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
      transaction: {
        update: jest.fn(),
      },
    };

    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 0,
    });

    repository = new TelegramTransactionConfirmationRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('creates and maps a persisted confirmation', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(null);
    prisma.telegramTransactionConfirmation.create.mockResolvedValue(record());

    const result = await repository.create({
      userId: 'user-id',
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: BigInt(123456),
      intent: intent as never,
    });

    expect(result.id).toBe('confirmation-id');
    expect(result.status).toBe('PENDING');
    expect(result.telegramUserId).toBe(BigInt(123456));
    expect(result.intent.amount).toBe(25000);
    expect(result.createdAt).toEqual(now);

    expect(prisma.telegramTransactionConfirmation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-id',
          chatId: 'chat-id',
          sourceMessageId: 'message-id',
          status: Status.PENDING,
          intent: expect.objectContaining({ amount: 25000 }),
        }),
        include: { transaction: { select: { id: true } } },
      }),
    );
  });

  it('returns an existing confirmation for the same chat and source message', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({ status: Status.CONFIRMED }),
    );

    const result = await repository.create({
      userId: 'user-id',
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: BigInt(123456),
      intent: intent as never,
    });

    expect(result.status).toBe('CONFIRMED');
    expect(
      prisma.telegramTransactionConfirmation.create,
    ).not.toHaveBeenCalled();
  });

  it('finds a confirmation by id', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record(),
    );

    const result = await repository.findById('confirmation-id');

    expect(result?.id).toBe('confirmation-id');
    expect(
      prisma.telegramTransactionConfirmation.findUnique,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'confirmation-id' },
        include: { transaction: { select: { id: true } } },
      }),
    );
  });

  it('recovers a stale PROCESSING confirmation to PENDING', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 1,
    });

    const staleBefore = new Date('2026-10-17T09:55:00.000Z');
    const count = await repository.recoverStaleProcessingByChatId(
      'chat-id',
      staleBefore,
    );

    expect(count).toBe(1);
    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        chatId: 'chat-id',
        status: Status.PROCESSING,
        updatedAt: { lte: staleBefore },
      },
      data: { status: Status.PENDING },
    });
  });

  it('does not overwrite a PROCESSING status if no stale record matched', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 0,
    });

    const count = await repository.recoverStaleProcessingByChatId(
      'chat-id',
      new Date('2026-10-17T09:55:00.000Z'),
    );

    expect(count).toBe(0);
    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chatId: 'chat-id',
          status: Status.PROCESSING,
        }),
        data: { status: Status.PENDING },
      }),
    );
  });

  it('expires pending confirmations whose expiry time has elapsed', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 2,
    });

    const count = await repository.expirePendingByChatId(
      'chat-id',
      new Date('2026-10-17T10:10:00.000Z'),
    );

    expect(count).toBe(2);
    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        chatId: 'chat-id',
        status: Status.PENDING,
        expiresAt: { lte: new Date('2026-10-17T10:10:00.000Z') },
      },
      data: { status: Status.EXPIRED },
    });
  });

  it('runs recovery before expiry and reads the latest confirmation', async () => {
    prisma.telegramTransactionConfirmation.findFirst.mockResolvedValue(
      record({ status: Status.EXPIRED }),
    );
    prisma.telegramTransactionConfirmation.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await repository.findLatestByChatId('chat-id');

    expect(result?.status).toBe('EXPIRED');
    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          chatId: 'chat-id',
          status: Status.PROCESSING,
          updatedAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
        data: { status: Status.PENDING },
      }),
    );
    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          chatId: 'chat-id',
          status: Status.PENDING,
          expiresAt: { lte: expect.any(Date) },
        },
        data: { status: Status.EXPIRED },
      }),
    );
    expect(
      prisma.telegramTransactionConfirmation.findFirst,
    ).toHaveBeenCalledWith({
      where: { chatId: 'chat-id' },
      orderBy: { createdAt: 'desc' },
      include: { transaction: { select: { id: true } } },
    });
  });

  it('finds a pending confirmation by chat id', async () => {
    prisma.telegramTransactionConfirmation.findFirst.mockResolvedValue(
      record(),
    );

    const result = await repository.findPendingByChatId('chat-id');

    expect(result?.status).toBe('PENDING');
    expect(
      prisma.telegramTransactionConfirmation.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        chatId: 'chat-id',
        status: Status.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      include: { transaction: { select: { id: true } } },
    });
  });

  it('confirms a pending, non-expired confirmation', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({ status: Status.CONFIRMED }),
    );

    const result = await repository.confirm('confirmation-id');

    expect(result?.status).toBe('CONFIRMED');
    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'confirmation-id',
          status: Status.PENDING,
          expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
        data: { status: Status.CONFIRMED },
      }),
    );
  });

  it('does not change a confirmation that is no longer pending', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 0,
    });
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({ status: Status.CANCELLED }),
    );

    const result = await repository.confirm('confirmation-id');

    expect(result?.status).toBe('CANCELLED');
  });

  it('does not cancel a confirmation that is no longer pending', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 0,
    });
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({ status: Status.CONFIRMED }),
    );

    const result = await repository.cancel('confirmation-id');

    expect(result?.status).toBe('CONFIRMED');
  });

  it('links the transaction and marks confirmation completed in one database transaction', async () => {
    const tx = {
      telegramTransactionConfirmation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'confirmation-id',
          status: Status.PROCESSING,
        }),
        update: jest
          .fn()
          .mockResolvedValue(record({ status: Status.COMPLETED })),
      },
      transaction: {
        update: jest.fn().mockResolvedValue({
          id: 'transaction-id',
          telegramConfirmationId: 'confirmation-id',
        }),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({
        status: Status.COMPLETED,
        transaction: { id: 'transaction-id' },
      }),
    );

    const result = await repository.markCompleted(
      'confirmation-id',
      'transaction-id',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.transaction.update).toHaveBeenCalledWith({
      where: { id: 'transaction-id' },
      data: { telegramConfirmationId: 'confirmation-id' },
    });
    expect(tx.telegramTransactionConfirmation.update).toHaveBeenCalledWith({
      where: { id: 'confirmation-id' },
      data: { status: Status.COMPLETED },
    });
    expect(result?.status).toBe('COMPLETED');
    expect(result?.transactionId).toBe('transaction-id');
  });

  it('parses confirmation and cancellation actions', () => {
    expect(repository.parseAction('ya')).toBe('CONFIRM');
    expect(repository.parseAction('CONFIRM')).toBe('CONFIRM');
    expect(repository.parseAction('batal')).toBe('CANCEL');
    expect(repository.parseAction('NO')).toBe('CANCEL');
    expect(repository.parseAction('mungkin')).toBe('UNKNOWN');
  });

  it('serializes and restores a transaction date in persisted intent', async () => {
    const transactionDate = new Date('2026-10-17T09:30:00.000Z');
    const persistedIntent = {
      ...intent,
      transactionDate: transactionDate.toISOString(),
    };

    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({ intent: persistedIntent }),
    );

    const result = await repository.findById('confirmation-id');

    expect(result?.intent.transactionDate).toEqual(transactionDate);
  });

  it('rethrows unique violations if no duplicate confirmation exists', async () => {
    const error = Object.assign(new Error('Unique violation'), {
      code: 'P2002',
    });

    prisma.telegramTransactionConfirmation.findUnique
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);

    prisma.telegramTransactionConfirmation.create.mockRejectedValue(error);

    await expect(
      repository.create({
        userId: 'user-id',
        chatId: 'chat-id',
        sourceMessageId: 'message-id',
        telegramAccountId: 'telegram-account-id',
        telegramUserId: BigInt(123456),
        intent: intent as never,
      }),
    ).rejects.toBe(error);
  });

  it('does not hide a non-unique create error', async () => {
    const error = new Error('Database unavailable');

    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(null);
    prisma.telegramTransactionConfirmation.create.mockRejectedValue(error);

    await expect(
      repository.create({
        userId: 'user-id',
        chatId: 'chat-id',
        sourceMessageId: 'message-id',
        telegramAccountId: 'telegram-account-id',
        telegramUserId: BigInt(123456),
        intent: intent as never,
      }),
    ).rejects.toBe(error);
  });

  it('claims a confirmed confirmation for exactly one processing attempt', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 1,
    });

    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({
        status: TelegramTransactionConfirmationStatus.PROCESSING,
      }),
    );

    const result = await repository.markProcessing('confirmation-id');

    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'confirmation-id',
        status: TelegramTransactionConfirmationStatus.CONFIRMED,
      },
      data: {
        status: TelegramTransactionConfirmationStatus.PROCESSING,
      },
    });

    expect(result?.status).toBe('PROCESSING');
    expect(
      prisma.telegramTransactionConfirmation.findUnique,
    ).toHaveBeenCalledTimes(1);
  });

  it('does not process a confirmation when another worker already claimed it', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await repository.markProcessing('confirmation-id');

    expect(result).toBeUndefined();
    expect(
      prisma.telegramTransactionConfirmation.findUnique,
    ).not.toHaveBeenCalled();
  });
});
