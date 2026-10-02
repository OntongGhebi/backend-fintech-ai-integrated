import { BadRequestException } from '@nestjs/common';

import { ConfirmedTransactionService } from './confirmed-transaction.service';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

describe('ConfirmedTransactionService', () => {
  let service: ConfirmedTransactionService;

  let transactionsService: {
    create: jest.Mock;
  };

  const confirmedConfirmation = {
    id: 'confirmation-id',
    userId: 'user-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: 'telegram-user-id',
    chatId: 'chat-id',
    sourceMessageId: 'message-id',
    status: 'CONFIRMED' as const,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    intent: {
      intent: 'CREATE_TRANSACTION' as const,
      transactionType: 'EXPENSE' as const,
      amount: 25000,
      description: 'beli makan',
      accountId: 'account-id',
      categoryId: 'category-id',
      transactionDate: new Date('2026-09-26T10:00:00.000Z'),
      source: 'DETERMINISTIC' as const,
      confidence: 1,
      originalIntent: {
        intent: 'CREATE_TRANSACTION' as const,
        transactionType: 'EXPENSE' as const,
        amount: 25000,
        description: 'beli makan',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        transactionDate: new Date('2026-09-26T10:00:00.000Z'),
        source: 'DETERMINISTIC' as const,
        confidence: 1,
      },
    },
  };

  beforeEach(() => {
    transactionsService = {
      create: jest.fn(),
    };

    service = new ConfirmedTransactionService(transactionsService as any);
  });

  it('should create a transaction from a confirmed intent', async () => {
    const createdTransaction = {
      id: 'transaction-id',
      userId: 'user-id',
      accountId: 'account-id',
      categoryId: 'category-id',
      type: 'EXPENSE',
      amount: 25000,
      currency: 'IDR',
      description: 'beli makan',
    };

    transactionsService.create.mockResolvedValue(createdTransaction);

    const result = await service.create(confirmedConfirmation);

    expect(result).toEqual(createdTransaction);

    expect(transactionsService.create).toHaveBeenCalledWith('user-id', {
      accountId: 'account-id',
      categoryId: 'category-id',
      type: TransactionType.EXPENSE,
      amount: 25000,
      currency: 'IDR',
      description: 'beli makan',
      transactionDate: '2026-09-26T10:00:00.000Z',
    });
  });

  it('should create an expense without category', async () => {
    transactionsService.create.mockResolvedValue({
      id: 'transaction-id',
    });

    const confirmation = {
      ...confirmedConfirmation,
      intent: {
        ...confirmedConfirmation.intent,
        categoryId: undefined,
      },
    };

    await service.create(confirmation);

    expect(transactionsService.create).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({
        accountId: 'account-id',
        categoryId: undefined,
        type: TransactionType.EXPENSE,
        amount: 25000,
        currency: 'IDR',
      }),
    );
  });

  it('should map an income intent to TransactionType.INCOME', async () => {
    transactionsService.create.mockResolvedValue({
      id: 'transaction-id',
    });

    const confirmation = {
      ...confirmedConfirmation,
      intent: {
        ...confirmedConfirmation.intent,
        transactionType: 'INCOME' as const,
      },
    };

    await service.create(confirmation);

    expect(transactionsService.create).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({
        type: TransactionType.INCOME,
        amount: 25000,
        currency: 'IDR',
      }),
    );
  });

  it('should reject a non-confirmed confirmation', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      status: 'PENDING' as const,
    };

    await expect(service.create(confirmation)).rejects.toThrow(
      BadRequestException,
    );

    expect(transactionsService.create).not.toHaveBeenCalled();
  });

  it('should reject a cancelled confirmation', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      status: 'CANCELLED' as const,
    };

    await expect(service.create(confirmation)).rejects.toThrow(
      BadRequestException,
    );

    expect(transactionsService.create).not.toHaveBeenCalled();
  });

  it('should reject an expired confirmation', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      status: 'EXPIRED' as const,
    };

    await expect(service.create(confirmation)).rejects.toThrow(
      BadRequestException,
    );

    expect(transactionsService.create).not.toHaveBeenCalled();
  });

  it('should reject an unsupported intent', async () => {
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

    expect(transactionsService.create).not.toHaveBeenCalled();
  });

  it('should reject an intent without transaction type', async () => {
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

    expect(transactionsService.create).not.toHaveBeenCalled();
  });

  it('should reject an invalid amount', async () => {
    const confirmation = {
      ...confirmedConfirmation,
      intent: {
        ...confirmedConfirmation.intent,
        amount: 0,
      },
    };

    await expect(service.create(confirmation)).rejects.toThrow(
      BadRequestException,
    );

    expect(transactionsService.create).not.toHaveBeenCalled();
  });

  it('should reject a missing account', async () => {
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

    expect(transactionsService.create).not.toHaveBeenCalled();
  });

  it('should preserve the transaction date', async () => {
    transactionsService.create.mockResolvedValue({
      id: 'transaction-id',
    });

    await service.create(confirmedConfirmation);

    expect(transactionsService.create).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({
        transactionDate: '2026-09-26T10:00:00.000Z',
      }),
    );
  });
});
