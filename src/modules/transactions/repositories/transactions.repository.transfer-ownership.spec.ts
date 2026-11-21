import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { TransactionsRepository } from './transactions.repository';

describe('TransactionsRepository — transfer ownership', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '99999999-9999-4999-8999-999999999999';
  const sourceAccountId = '22222222-2222-4222-8222-222222222222';
  const destinationAccountId = '33333333-3333-4333-8333-333333333333';
  const foreignAccountId = '44444444-4444-4444-8444-444444444444';

  let repository: TransactionsRepository;

  let tx: {
    $queryRaw: jest.Mock;
    account: {
      findFirst: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
  };

  let prisma: {
    $transaction: jest.Mock;
  };

  const sourceData = {
    userId,
    accountId: sourceAccountId,
    type: 'TRANSFER',
    amount: new Prisma.Decimal('100.0000'),
    metadata: { direction: 'OUT' },
  };

  const destinationData = {
    userId,
    accountId: destinationAccountId,
    type: 'TRANSFER',
    amount: new Prisma.Decimal('100.0000'),
    metadata: { direction: 'IN' },
  };

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: sourceAccountId }]),
      account: {
        findFirst: jest.fn((args: { where: { id: string } }) => {
          if (args.where.id === sourceAccountId) {
            return Promise.resolve({
              openingBalance: new Prisma.Decimal('500.0000'),
            });
          }

          if (args.where.id === destinationAccountId) {
            return Promise.resolve({ id: destinationAccountId });
          }

          return Promise.resolve(null);
        }),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'source-transaction' })
          .mockResolvedValueOnce({ id: 'destination-transaction' }),
      },
    };

    prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    repository = new TransactionsRepository(prisma as unknown as PrismaService);
  });

  it('rejects when source and destination transactions have different user IDs', async () => {
    await expect(
      repository.createTransfer(
        sourceData as never,
        {
          ...destinationData,
          userId: otherUserId,
        } as never,
      ),
    ).rejects.toThrow(
      new BadRequestException('Transfer accounts must belong to the same user'),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when source and destination account IDs are identical', async () => {
    await expect(
      repository.createTransfer(
        sourceData as never,
        {
          ...destinationData,
          accountId: sourceAccountId,
        } as never,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Source and destination accounts must be different',
      ),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a destination account that does not belong to the user', async () => {
    tx.account.findFirst.mockImplementation(
      (args: { where: { id: string } }) => {
        if (args.where.id === sourceAccountId) {
          return Promise.resolve({
            openingBalance: new Prisma.Decimal('500.0000'),
          });
        }

        return Promise.resolve(null);
      },
    );

    await expect(
      repository.createTransfer(
        sourceData as never,
        {
          ...destinationData,
          accountId: foreignAccountId,
        } as never,
      ),
    ).rejects.toThrow(
      new BadRequestException('Destination account is not available'),
    );

    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('does not create transactions when the source account is unavailable', async () => {
    tx.account.findFirst.mockResolvedValue(null);

    await expect(
      repository.createTransfer(sourceData as never, destinationData as never),
    ).rejects.toThrow(
      new BadRequestException('Source account is not available'),
    );

    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('creates both transfer transactions when both accounts belong to the user', async () => {
    const result = await repository.createTransfer(
      sourceData as never,
      destinationData as never,
    );

    expect(result).toEqual({
      sourceTransaction: { id: 'source-transaction' },
      destinationTransaction: { id: 'destination-transaction' },
    });

    expect(tx.account.findFirst).toHaveBeenCalledWith({
      where: {
        id: sourceAccountId,
        userId,
        deletedAt: null,
      },
      select: {
        openingBalance: true,
      },
    });

    expect(tx.account.findFirst).toHaveBeenCalledWith({
      where: {
        id: destinationAccountId,
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    expect(tx.transaction.create).toHaveBeenCalledTimes(2);
  });

  it('does not return an existing Telegram transfer belonging to another user', async () => {
    tx.transaction.findUnique.mockResolvedValue({
      id: 'foreign-source-transaction',
      userId: otherUserId,
      accountId: sourceAccountId,
      transferGroupId: 'confirmation-id',
    });

    await expect(
      repository.createTransfer(
        {
          ...sourceData,
          telegramConfirmationId: 'confirmation-id',
        } as never,
        {
          ...destinationData,
          transferGroupId: 'confirmation-id',
        } as never,
      ),
    ).rejects.toThrow(new BadRequestException('Transfer is not available'));

    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.transaction.findFirst).not.toHaveBeenCalled();
  });

  it('does not return an existing transfer when its destination account differs from the request', async () => {
    tx.transaction.findUnique.mockResolvedValue({
      id: 'source-transaction',
      userId,
      accountId: sourceAccountId,
      transferGroupId: 'confirmation-id',
    });

    tx.transaction.findFirst.mockResolvedValue(null);

    await expect(
      repository.createTransfer(
        {
          ...sourceData,
          telegramConfirmationId: 'confirmation-id',
        } as never,
        {
          ...destinationData,
          transferGroupId: 'confirmation-id',
        } as never,
      ),
    ).rejects.toThrow('TELEGRAM_TRANSFER_INCOMPLETE');

    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('returns the existing Telegram transfer only when both transactions match the requested owner and accounts', async () => {
    const existingSource = {
      id: 'source-transaction',
      userId,
      accountId: sourceAccountId,
      transferGroupId: 'confirmation-id',
    };

    const existingDestination = {
      id: 'destination-transaction',
      userId,
      accountId: destinationAccountId,
      transferGroupId: 'confirmation-id',
    };

    tx.transaction.findUnique.mockResolvedValue(existingSource);
    tx.transaction.findFirst.mockResolvedValue(existingDestination);

    const result = await repository.createTransfer(
      {
        ...sourceData,
        telegramConfirmationId: 'confirmation-id',
      } as never,
      {
        ...destinationData,
        transferGroupId: 'confirmation-id',
      } as never,
    );

    expect(result).toEqual({
      sourceTransaction: existingSource,
      destinationTransaction: existingDestination,
    });

    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});
