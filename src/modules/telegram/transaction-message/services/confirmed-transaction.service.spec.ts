import { BadRequestException } from '@nestjs/common';

import { TransactionType } from 'src/database/enums/transaction-type.enum';
import { ConfirmedTransactionService } from './confirmed-transaction.service';

describe('ConfirmedTransactionService', () => {
  let service: ConfirmedTransactionService;

  let transactionsService: {
    createTelegramConfirmedTransaction: jest.Mock;
  };

  const transactionDate = new Date('2026-09-26T10:00:00.000Z');

  const confirmedConfirmation = {
    id: 'confirmation-id',
    userId: 'user-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: BigInt(123456),
    chatId: 'chat-id',
    sourceMessageId: 'message-id',
    status: 'CONFIRMED' as const,
    createdAt: new Date('2026-09-26T09:55:00.000Z'),
    expiresAt: new Date('2026-09-26T10:00:00.000Z'),
    intent: {
      intent: 'CREATE_TRANSACTION' as const,
      transactionType: 'EXPENSE' as const,
      amount: 25000,
      description: 'beli makan',
      accountId: 'account-id',
      categoryId: 'category-id',
      transactionDate,
      source: 'DETERMINISTIC' as const,
      confidence: 1,
      originalIntent: {
        intent: 'CREATE_TRANSACTION' as const,
        transactionType: 'EXPENSE' as const,
        amount: 25000,
        description: 'beli makan',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        transactionDate,
        source: 'DETERMINISTIC' as const,
        confidence: 1,
      },
    },
  };

  const createdTransaction = {
    id: 'transaction-id',
    userId: 'user-id',
    accountId: 'account-id',
    categoryId: 'category-id',
    telegramConfirmationId: 'confirmation-id',
    type: 'EXPENSE',
    amount: 25000,
    currency: 'IDR',
    description: 'beli makan',
    transactionDate,
    source: 'TELEGRAM',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    transactionsService = {
      createTelegramConfirmedTransaction: jest.fn(),
    };

    service = new ConfirmedTransactionService(transactionsService as never);

    transactionsService.createTelegramConfirmedTransaction.mockResolvedValue(
      createdTransaction,
    );
  });

  it('creates a transaction from a confirmed expense intent', async () => {
    const result = await service.create(confirmedConfirmation);

    expect(result).toEqual(createdTransaction);
    expect(
      transactionsService.createTelegramConfirmedTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(
      transactionsService.createTelegramConfirmedTransaction,
    ).toHaveBeenCalledWith({
      userId: 'user-id',
      confirmationId: 'confirmation-id',
      accountId: 'account-id',
      categoryId: 'category-id',
      type: TransactionType.EXPENSE,
      amount: 25000,
      description: 'beli makan',
      transactionDate,
    });
  });

  it('maps an income intent to TransactionType.INCOME', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      intent: {
        ...confirmedConfirmation.intent,
        transactionType: 'INCOME' as const,
      },
    };

    await service.create(confirmation);

    expect(
      transactionsService.createTelegramConfirmedTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        type: TransactionType.INCOME,
        confirmationId: 'confirmation-id',
        userId: 'user-id',
      }),
    );
  });

  it.each(['PENDING', 'CANCELLED', 'EXPIRED', 'COMPLETED'] as const)(
    'rejects confirmation status %s',
    async (status) => {
      const confirmation = {
        ...confirmedConfirmation,
        status,
      };

      await expect(service.create(confirmation)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        transactionsService.createTelegramConfirmedTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it('accepts PROCESSING for safe retries', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      status: 'PROCESSING' as const,
    };

    await service.create(confirmation);

    expect(
      transactionsService.createTelegramConfirmedTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationId: 'confirmation-id',
      }),
    );
  });

  it('rejects an unsupported intent', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      intent: {
        ...confirmedConfirmation.intent,
        intent: 'UNKNOWN' as const,
      },
    };

    await expect(service.create(confirmation)).rejects.toThrow(
      BadRequestException,
    );

    expect(
      transactionsService.createTelegramConfirmedTransaction,
    ).not.toHaveBeenCalled();
  });

  it('rejects a missing transaction type', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      intent: {
        ...confirmedConfirmation.intent,
        transactionType: undefined,
      },
    };

    await expect(service.create(confirmation)).rejects.toThrow(
      BadRequestException,
    );

    expect(
      transactionsService.createTelegramConfirmedTransaction,
    ).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid amount %s',
    async (amount) => {
      const confirmation = {
        ...confirmedConfirmation,
        intent: {
          ...confirmedConfirmation.intent,
          amount,
        },
      };

      await expect(service.create(confirmation)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        transactionsService.createTelegramConfirmedTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing account ID', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      intent: {
        ...confirmedConfirmation.intent,
        accountId: undefined,
      },
    };

    await expect(service.create(confirmation)).rejects.toThrow(
      BadRequestException,
    );

    expect(
      transactionsService.createTelegramConfirmedTransaction,
    ).not.toHaveBeenCalled();
  });

  it('trims the description before passing it to TransactionsService', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      intent: {
        ...confirmedConfirmation.intent,
        description: '  beli makan  ',
      },
    };

    await service.create(confirmation);

    expect(
      transactionsService.createTelegramConfirmedTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'beli makan',
      }),
    );
  });

  it('preserves the transaction date', async () => {
    await service.create(confirmedConfirmation);

    expect(
      transactionsService.createTelegramConfirmedTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionDate,
      }),
    );
  });

  it('uses the current date when the intent has no transaction date', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      intent: {
        ...confirmedConfirmation.intent,
        transactionDate: undefined,
      },
    };

    const before = Date.now();
    await service.create(confirmation);
    const after = Date.now();

    const call =
      transactionsService.createTelegramConfirmedTransaction.mock.calls[0][0];

    expect(call.transactionDate).toBeInstanceOf(Date);
    expect(call.transactionDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.transactionDate.getTime()).toBeLessThanOrEqual(after);
  });

  it('propagates transaction service failures', async () => {
    const error = new Error('Database unavailable');

    transactionsService.createTelegramConfirmedTransaction.mockRejectedValue(
      error,
    );

    await expect(service.create(confirmedConfirmation)).rejects.toBe(error);
  });
});
