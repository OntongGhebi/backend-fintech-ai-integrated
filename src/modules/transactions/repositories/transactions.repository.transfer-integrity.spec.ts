import { BadRequestException } from '@nestjs/common';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { TransactionsRepository } from './transactions.repository';

describe('TransactionsRepository — transfer update and void integrity', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const transferGroupId = '22222222-2222-4222-8222-222222222222';
  const sourceTransactionId = '33333333-3333-4333-8333-333333333333';
  const destinationTransactionId = '44444444-4444-4444-8444-444444444444';

  let repository: TransactionsRepository;

  let tx: {
    $queryRaw: jest.Mock;
    transaction: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  let prisma: {
    $transaction: jest.Mock;
  };

  const validTransferPair = [
    {
      id: sourceTransactionId,
      type: 'TRANSFER',
      status: 'ACTIVE',
      metadata: {
        direction: 'OUT',
      },
    },
    {
      id: destinationTransactionId,
      type: 'TRANSFER',
      status: 'ACTIVE',
      metadata: {
        direction: 'IN',
      },
    },
  ];

  beforeEach(() => {
    tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { id: sourceTransactionId },
          { id: destinationTransactionId },
        ]),
      transaction: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    repository = new TransactionsRepository(prisma as unknown as PrismaService);
  });

  describe('update', () => {
    it('updates both legs of a transfer atomically', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'TRANSFER',
        transferGroupId,
      });

      tx.transaction.findMany.mockResolvedValue(validTransferPair);
      tx.transaction.updateMany.mockResolvedValue({
        count: 2,
      });

      const result = await repository.update(sourceTransactionId, userId, {
        amount: 150000,
        description: 'Updated transfer',
        transactionDate: new Date('2026-11-22T10:00:00.000Z'),
      });

      expect(result).toEqual({
        count: 2,
      });

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);

      expect(tx.transaction.findMany).toHaveBeenCalledWith({
        where: {
          transferGroupId,
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
          type: true,
          status: true,
          metadata: true,
        },
      });

      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [sourceTransactionId, destinationTransactionId],
          },
          userId,
          transferGroupId,
          type: 'TRANSFER',
          status: 'ACTIVE',
          deletedAt: null,
        },
        data: {
          amount: 150000,
          description: 'Updated transfer',
          transactionDate: new Date('2026-11-22T10:00:00.000Z'),
        },
      });
    });

    it('rejects changing only one transfer account', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'TRANSFER',
        transferGroupId,
      });

      await expect(
        repository.update(sourceTransactionId, userId, {
          accountId: '55555555-5555-4555-8555-555555555555',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Transfer account and category cannot be changed through transaction update',
        ),
      );

      expect(tx.transaction.findMany).not.toHaveBeenCalled();
      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('rejects changing only one transfer category', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'TRANSFER',
        transferGroupId,
      });

      await expect(
        repository.update(sourceTransactionId, userId, {
          categoryId: null,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Transfer account and category cannot be changed through transaction update',
        ),
      );

      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an incomplete transfer pair', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'TRANSFER',
        transferGroupId,
      });

      tx.transaction.findMany.mockResolvedValue([validTransferPair[0]]);

      await expect(
        repository.update(sourceTransactionId, userId, {
          amount: 150000,
        }),
      ).rejects.toThrow(
        new BadRequestException('Transfer pair is incomplete or inconsistent'),
      );

      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a transfer pair with an invalid direction', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'TRANSFER',
        transferGroupId,
      });

      tx.transaction.findMany.mockResolvedValue([
        validTransferPair[0],
        {
          ...validTransferPair[1],
          metadata: {
            direction: 'OUT',
          },
        },
      ]);

      await expect(
        repository.update(sourceTransactionId, userId, {
          amount: 150000,
        }),
      ).rejects.toThrow(
        new BadRequestException('Transfer pair is incomplete or inconsistent'),
      );

      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when updating a transfer without a transfer group', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'TRANSFER',
        transferGroupId: null,
      });

      await expect(
        repository.update(sourceTransactionId, userId, {
          amount: 150000,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Transfer transaction is missing its transfer group',
        ),
      );

      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('locks a normal transaction before conditionally updating it', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'EXPENSE',
        transferGroupId: null,
      });

      tx.transaction.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await repository.update(sourceTransactionId, userId, {
        amount: 150000,
      });

      expect(result).toEqual({
        count: 1,
      });

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);

      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: sourceTransactionId,
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          type: {
            not: 'TRANSFER',
          },
        },
        data: {
          amount: 150000,
        },
      });
    });

    it('returns zero when the transaction does not belong to the user', async () => {
      tx.transaction.findFirst.mockResolvedValue(null);

      const result = await repository.update(sourceTransactionId, userId, {
        amount: 150000,
      });

      expect(result).toEqual({
        count: 0,
      });

      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('voidTransaction', () => {
    it('voids both legs of a transfer atomically', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'TRANSFER',
        transferGroupId,
      });

      tx.transaction.findMany.mockResolvedValue(validTransferPair);
      tx.transaction.updateMany.mockResolvedValue({
        count: 2,
      });

      const result = await repository.voidTransaction(
        sourceTransactionId,
        userId,
      );

      expect(result).toEqual({
        count: 2,
      });

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);

      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [sourceTransactionId, destinationTransactionId],
          },
          userId,
          transferGroupId,
          type: 'TRANSFER',
          status: 'ACTIVE',
          deletedAt: null,
        },
        data: {
          status: 'VOIDED',
        },
      });
    });

    it('does not partially void an inconsistent transfer pair', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'TRANSFER',
        transferGroupId,
      });

      tx.transaction.findMany.mockResolvedValue([validTransferPair[0]]);

      await expect(
        repository.voidTransaction(sourceTransactionId, userId),
      ).rejects.toThrow(
        new BadRequestException('Transfer pair is incomplete or inconsistent'),
      );

      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('rejects voiding a transfer without a transfer group', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'TRANSFER',
        transferGroupId: null,
      });

      await expect(
        repository.voidTransaction(sourceTransactionId, userId),
      ).rejects.toThrow(
        new BadRequestException(
          'Transfer transaction is missing its transfer group',
        ),
      );

      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('locks and conditionally voids a normal transaction', async () => {
      tx.transaction.findFirst.mockResolvedValue({
        id: sourceTransactionId,
        type: 'EXPENSE',
        transferGroupId: null,
      });

      tx.transaction.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await repository.voidTransaction(
        sourceTransactionId,
        userId,
      );

      expect(result).toEqual({
        count: 1,
      });

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);

      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: sourceTransactionId,
          userId,
          deletedAt: null,
          status: 'ACTIVE',
          type: {
            not: 'TRANSFER',
          },
        },
        data: {
          status: 'VOIDED',
        },
      });
    });

    it('returns zero when the transaction does not exist', async () => {
      tx.transaction.findFirst.mockResolvedValue(null);

      const result = await repository.voidTransaction(
        sourceTransactionId,
        userId,
      );

      expect(result).toEqual({
        count: 0,
      });

      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    });
  });
});
