import { TelegramTransactionConfirmationRepository } from './telegram-transaction-confirmation.repository';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { TelegramTransactionConfirmationStatus } from '../../../../generated/prisma/enums';

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
    status: TelegramTransactionConfirmationStatus.PENDING,
    createdAt: now,
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
          status: TelegramTransactionConfirmationStatus.PENDING,
          intent: expect.objectContaining({ amount: 25000 }),
        }),
        include: { transaction: { select: { id: true } } },
      }),
    );
  });

  it('returns an existing confirmation for the same chat and source message', async () => {
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({ status: TelegramTransactionConfirmationStatus.CONFIRMED }),
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

  it('marks an expired pending confirmation as expired', async () => {
    prisma.telegramTransactionConfirmation.findFirst.mockResolvedValue(
      record({
        expiresAt: new Date(now.getTime() - 1000),
      }),
    );
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({
        status: TelegramTransactionConfirmationStatus.EXPIRED,
        expiresAt: new Date(now.getTime() - 1000),
      }),
    );

    const result = await repository.findPendingByChatId('chat-id');

    expect(result?.status).toBe('EXPIRED');
    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'confirmation-id',
          status: TelegramTransactionConfirmationStatus.PENDING,
        }),
        data: { status: TelegramTransactionConfirmationStatus.EXPIRED },
      }),
    );
  });

  it('confirms a pending, non-expired confirmation', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({ status: TelegramTransactionConfirmationStatus.CONFIRMED }),
    );

    const result = await repository.confirm('confirmation-id');

    expect(result?.status).toBe('CONFIRMED');
    expect(
      prisma.telegramTransactionConfirmation.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'confirmation-id',
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
        data: { status: TelegramTransactionConfirmationStatus.CONFIRMED },
      }),
    );
  });

  it('does not change a confirmation that is no longer pending', async () => {
    prisma.telegramTransactionConfirmation.updateMany.mockResolvedValue({
      count: 0,
    });
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({ status: TelegramTransactionConfirmationStatus.CANCELLED }),
    );

    const result = await repository.confirm('confirmation-id');

    expect(result?.status).toBe('CANCELLED');
  });

  it('links the transaction and marks confirmation completed in one database transaction', async () => {
    const tx = {
      telegramTransactionConfirmation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'confirmation-id',
          status: TelegramTransactionConfirmationStatus.PROCESSING,
        }),
        update: jest
          .fn()
          .mockResolvedValue(
            record({ status: TelegramTransactionConfirmationStatus.COMPLETED }),
          ),
      },
      transaction: {
        update: jest.fn().mockResolvedValue({
          id: 'transaction-id',
          telegramConfirmationId: 'confirmation-id',
        }),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (transactionClient: typeof tx) => Promise<void>) =>
        callback(tx),
    );
    prisma.telegramTransactionConfirmation.findUnique.mockResolvedValue(
      record({
        status: TelegramTransactionConfirmationStatus.COMPLETED,
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
      data: { status: TelegramTransactionConfirmationStatus.COMPLETED },
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
});
