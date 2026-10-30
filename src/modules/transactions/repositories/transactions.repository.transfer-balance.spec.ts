import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { TransactionsRepository } from './transactions.repository';

describe('TransactionsRepository transfer balance validation', () => {
  const accountId = '22222222-2222-4222-8222-222222222222';
  const destinationAccountId = '33333333-3333-4333-8333-333333333333';
  const userId = '11111111-1111-4111-8111-111111111111';

  let repository: TransactionsRepository;
  let transactionClient: {
    $queryRaw: jest.Mock;
    account: { findFirst: jest.Mock };
    transaction: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
  };
  let prisma: { $transaction: jest.Mock };

  const sourceData = {
    userId,
    accountId,
    type: 'TRANSFER',
    amount: new Prisma.Decimal('100.0000'),
    metadata: { direction: 'OUT' },
  };
  const destinationData = {
    ...sourceData,
    accountId: destinationAccountId,
    metadata: { direction: 'IN' },
  };

  beforeEach(() => {
    transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: accountId }]),
      account: {
        findFirst: jest.fn().mockResolvedValue({
          openingBalance: new Prisma.Decimal('100.0000'),
        }),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'transaction-id' }),
      },
    };

    prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(transactionClient),
      ),
    };

    repository = new TransactionsRepository(prisma as unknown as PrismaService);
  });

  it('rejects a transfer when the source balance is zero', async () => {
    transactionClient.account.findFirst.mockResolvedValue({
      openingBalance: new Prisma.Decimal('0.0000'),
    });

    await expect(
      repository.createTransfer(sourceData as never, destinationData as never),
    ).rejects.toThrow(
      new BadRequestException('Source account has no available balance'),
    );

    expect(transactionClient.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects a transfer greater than the source balance', async () => {
    transactionClient.account.findFirst.mockResolvedValue({
      openingBalance: new Prisma.Decimal('99.0000'),
    });

    await expect(
      repository.createTransfer(sourceData as never, destinationData as never),
    ).rejects.toThrow(
      new BadRequestException(
        'Insufficient source account balance. Available balance: 99.0000',
      ),
    );

    expect(transactionClient.transaction.create).not.toHaveBeenCalled();
  });

  it('allows a transfer equal to the available source balance', async () => {
    await expect(
      repository.createTransfer(sourceData as never, destinationData as never),
    ).resolves.toEqual({
      sourceTransaction: { id: 'transaction-id' },
      destinationTransaction: { id: 'transaction-id' },
    });

    expect(transactionClient.transaction.create).toHaveBeenCalledTimes(2);
  });

  it('includes incoming and outgoing transfers when calculating the source balance', async () => {
    transactionClient.account.findFirst.mockResolvedValue({
      openingBalance: new Prisma.Decimal('100.0000'),
    });
    transactionClient.transaction.findMany.mockResolvedValue([
      {
        type: 'TRANSFER',
        amount: new Prisma.Decimal('80.0000'),
        metadata: { direction: 'OUT' },
      },
      {
        type: 'TRANSFER',
        amount: new Prisma.Decimal('20.0000'),
        metadata: { direction: 'IN' },
      },
    ]);

    await expect(
      repository.createTransfer(sourceData as never, destinationData as never),
    ).rejects.toThrow(
      new BadRequestException(
        'Insufficient source account balance. Available balance: 40.0000',
      ),
    );

    expect(transactionClient.transaction.create).not.toHaveBeenCalled();
  });
});
