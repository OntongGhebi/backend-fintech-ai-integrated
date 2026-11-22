import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { runSerializableTransaction } from './serializable-transaction.util';

describe('runSerializableTransaction', () => {
  let prisma: {
    $transaction: jest.Mock;
  };

  const tx = {
    marker: 'transaction-client',
  } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
    };
  });

  it('executes the operation using Serializable isolation', async () => {
    prisma.$transaction.mockImplementation(
      async (callback: (client: Prisma.TransactionClient) => unknown) =>
        callback(tx),
    );

    const operation = jest.fn().mockResolvedValue('success');

    const result = await runSerializableTransaction(
      prisma as unknown as PrismaService,
      operation,
      {
        baseDelayMs: 0,
      },
    );

    expect(result).toBe('success');
    expect(prisma.$transaction).toHaveBeenCalledWith(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(operation).toHaveBeenCalledWith(tx);
  });

  it('retries the entire transaction after P2034', async () => {
    const serializationError = Object.assign(
      new Error('Transaction failed due to a write conflict'),
      {
        code: 'P2034',
      },
    );

    prisma.$transaction
      .mockRejectedValueOnce(serializationError)
      .mockImplementationOnce(
        async (callback: (client: Prisma.TransactionClient) => unknown) =>
          callback(tx),
      );

    const operation = jest.fn().mockResolvedValue('committed');

    const result = await runSerializableTransaction(
      prisma as unknown as PrismaService,
      operation,
      {
        maxRetries: 2,
        baseDelayMs: 0,
      },
    );

    expect(result).toBe('committed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries more than once when serialization conflicts continue', async () => {
    const serializationError = Object.assign(
      new Error('Serialization conflict'),
      {
        code: 'P2034',
      },
    );

    prisma.$transaction
      .mockRejectedValueOnce(serializationError)
      .mockRejectedValueOnce(serializationError)
      .mockImplementationOnce(
        async (callback: (client: Prisma.TransactionClient) => unknown) =>
          callback(tx),
      );

    const result = await runSerializableTransaction(
      prisma as unknown as PrismaService,
      async () => 'success',
      {
        maxRetries: 2,
        baseDelayMs: 0,
      },
    );

    expect(result).toBe('success');
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-serialization errors', async () => {
    const uniqueConstraintError = Object.assign(
      new Error('Unique constraint failed'),
      {
        code: 'P2002',
      },
    );

    prisma.$transaction.mockRejectedValue(uniqueConstraintError);

    await expect(
      runSerializableTransaction(
        prisma as unknown as PrismaService,
        async () => 'success',
        {
          baseDelayMs: 0,
        },
      ),
    ).rejects.toBe(uniqueConstraintError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('propagates the final serialization error after exhausting retries', async () => {
    const serializationError = Object.assign(
      new Error('Serialization conflict'),
      {
        code: 'P2034',
      },
    );

    prisma.$transaction.mockRejectedValue(serializationError);

    await expect(
      runSerializableTransaction(
        prisma as unknown as PrismaService,
        async () => 'success',
        {
          maxRetries: 2,
          baseDelayMs: 0,
        },
      ),
    ).rejects.toBe(serializationError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
