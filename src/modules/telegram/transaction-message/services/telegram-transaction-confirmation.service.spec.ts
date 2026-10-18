import { Test, TestingModule } from '@nestjs/testing';

import { ConfirmedTransactionService } from './confirmed-transaction.service';
import {
  TelegramTransactionConfirmationContext,
  TelegramTransactionConfirmationService,
} from './telegram-transaction-confirmation.service';
import { TransactionConfirmationMessageService } from './transaction-confirmation-message.service';
import { TransactionConfirmationService } from './transaction-confirmation.service';
import { PendingTransactionConfirmation } from '../types/transaction-confirmation.types';
import { TelegramTransactionErrorService } from '../../services/transaction/telegram-transaction-error.service';

describe('TelegramTransactionConfirmationService', () => {
  let service: TelegramTransactionConfirmationService;

  const transactionConfirmationService = {
    create: jest.fn(),
    findById: jest.fn(),
    findPendingByChatId: jest.fn(),
    findLatestByChatId: jest.fn(),
    parseAction: jest.fn(),
    confirm: jest.fn(),
    markProcessing: jest.fn(),
    markCompleted: jest.fn(),
    cancel: jest.fn(),
  };

  const transactionConfirmationMessageService = {
    format: jest.fn(),
    formatConfirmed: jest.fn().mockReturnValue('CONFIRMED'),
    formatCancelled: jest.fn().mockReturnValue('CANCELLED'),
    formatExpired: jest.fn().mockReturnValue('EXPIRED'),
    formatNoPendingConfirmation: jest.fn().mockReturnValue('NO_PENDING'),
    formatUnknownAction: jest.fn().mockReturnValue('UNKNOWN'),
    formatAlreadyProcessed: jest.fn().mockReturnValue('ALREADY_PROCESSED'),
    formatProcessing: jest.fn().mockReturnValue('PROCESSING'),
    formatTransactionCreated: jest.fn().mockReturnValue('TRANSACTION_CREATED'),
  };

  const confirmedTransactionService = {
    create: jest.fn(),
  };

  const baseIntent = {
    intent: 'CREATE_TRANSACTION' as const,
    transactionType: 'EXPENSE' as const,
    amount: 25000,
    description: 'beli makan',
    accountId: 'account-id',
    categoryId: 'category-id',
    transactionDate: new Date('2026-09-26T10:00:00.000Z'),
    confidence: 1,
    source: 'DETERMINISTIC' as const,
    originalIntent: {
      intent: 'CREATE_TRANSACTION' as const,
      transactionType: 'EXPENSE' as const,
      amount: 25000,
      description: 'beli makan',
      accountHint: 'BCA',
      confidence: 1,
      source: 'DETERMINISTIC' as const,
    },
  };

  const createConfirmation = (
    overrides: Partial<PendingTransactionConfirmation> = {},
  ): PendingTransactionConfirmation => ({
    id: 'confirmation-id',
    userId: 'user-id',
    chatId: 'chat-id',
    sourceMessageId: 'message-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: BigInt(123456789),
    intent: baseIntent,
    status: 'PENDING',
    createdAt: new Date('2026-09-26T10:00:00.000Z'),
    expiresAt: new Date('2026-09-26T10:05:00.000Z'),
    ...overrides,
  });

  const createContext = (
    overrides: Partial<TelegramTransactionConfirmationContext> = {},
  ): TelegramTransactionConfirmationContext => ({
    userId: 'user-id',
    chatId: 'chat-id',
    sourceMessageId: 'message-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: BigInt(123456789),
    text: 'YA',
    ...overrides,
  });

  const errorService = {
    handle: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramTransactionConfirmationService,
        {
          provide: TransactionConfirmationService,
          useValue: transactionConfirmationService,
        },
        {
          provide: TransactionConfirmationMessageService,
          useValue: transactionConfirmationMessageService,
        },
        {
          provide: ConfirmedTransactionService,
          useValue: confirmedTransactionService,
        },
        {
          provide: TelegramTransactionErrorService,
          useValue: errorService,
        },
      ],
    }).compile();

    service = module.get<TelegramTransactionConfirmationService>(
      TelegramTransactionConfirmationService,
    );
  });

  it('should create a transaction when user confirms', async () => {
    const confirmation = createConfirmation();

    const transaction = {
      id: 'transaction-id',
      type: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
    };

    transactionConfirmationService.findLatestByChatId.mockResolvedValue(
      confirmation,
    );

    transactionConfirmationService.parseAction.mockReturnValue('CONFIRM');

    transactionConfirmationService.confirm.mockResolvedValue({
      ...confirmation,
      status: 'CONFIRMED',
    });

    transactionConfirmationService.markProcessing.mockResolvedValue({
      ...confirmation,
      status: 'PROCESSING',
    });

    confirmedTransactionService.create.mockResolvedValue(transaction);

    transactionConfirmationService.markCompleted.mockResolvedValue({
      ...confirmation,
      status: 'COMPLETED',
      transactionId: 'transaction-id',
    });

    const result = await service.handle(
      createContext({
        text: 'YA',
      }),
    );

    expect(confirmedTransactionService.create).toHaveBeenCalledTimes(1);

    expect(transactionConfirmationService.markProcessing).toHaveBeenCalledWith(
      'confirmation-id',
    );

    expect(transactionConfirmationService.markCompleted).toHaveBeenCalledWith(
      'confirmation-id',
      'transaction-id',
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('CONFIRM');
    expect(result.status).toBe('COMPLETED');
    expect(result.transactionId).toBe('transaction-id');
    expect(result.message).toBe('TRANSACTION_CREATED');
  });

  it('should cancel without creating a transaction', async () => {
    const confirmation = createConfirmation();

    transactionConfirmationService.findLatestByChatId.mockResolvedValue(
      confirmation,
    );

    transactionConfirmationService.parseAction.mockReturnValue('CANCEL');

    transactionConfirmationService.cancel.mockReturnValue({
      ...confirmation,
      status: 'CANCELLED',
    });

    const result = await service.handle(
      createContext({
        text: 'BATAL',
      }),
    );

    expect(confirmedTransactionService.create).not.toHaveBeenCalled();

    expect(transactionConfirmationService.cancel).toHaveBeenCalledWith(
      'confirmation-id',
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('CANCEL');
    expect(result.status).toBe('CANCELLED');
    expect(result.message).toBe('CANCELLED');
  });

  it('should not create a transaction for unknown reply', async () => {
    const confirmation = createConfirmation();

    transactionConfirmationService.findLatestByChatId.mockResolvedValue(
      confirmation,
    );

    transactionConfirmationService.parseAction.mockReturnValue('UNKNOWN');

    const result = await service.handle(
      createContext({
        text: 'MUNGKIN',
      }),
    );

    expect(confirmedTransactionService.create).not.toHaveBeenCalled();

    expect(transactionConfirmationService.confirm).not.toHaveBeenCalled();

    expect(transactionConfirmationService.cancel).not.toHaveBeenCalled();

    expect(result.handled).toBe(true);
    expect(result.action).toBe('UNKNOWN');
    expect(result.status).toBe('UNKNOWN');
    expect(result.message).toBe('UNKNOWN');
  });

  it('should not process another user confirmation', async () => {
    const confirmation = createConfirmation({
      userId: 'another-user-id',
    });

    transactionConfirmationService.findLatestByChatId.mockResolvedValue(
      confirmation,
    );

    const result = await service.handle(
      createContext({
        userId: 'user-id',
        text: 'YA',
      }),
    );

    expect(confirmedTransactionService.create).not.toHaveBeenCalled();

    expect(transactionConfirmationService.confirm).not.toHaveBeenCalled();

    expect(result.handled).toBe(false);
    expect(result.action).toBe('NONE');
    expect(result.status).toBe('NONE');
    expect(result.message).toBe('NO_PENDING');
  });

  it('should not create the transaction twice', async () => {
    const confirmation = createConfirmation();

    const transaction = {
      id: 'transaction-id',
      type: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
    };

    transactionConfirmationService.findLatestByChatId
      .mockReturnValueOnce(confirmation)
      .mockReturnValueOnce({
        ...confirmation,
        status: 'COMPLETED',
        transactionId: 'transaction-id',
      });

    transactionConfirmationService.parseAction.mockReturnValue('CONFIRM');

    transactionConfirmationService.confirm.mockResolvedValue({
      ...confirmation,
      status: 'CONFIRMED',
    });

    transactionConfirmationService.markProcessing.mockResolvedValue({
      ...confirmation,
      status: 'PROCESSING',
    });

    confirmedTransactionService.create.mockResolvedValue(transaction);

    transactionConfirmationService.markCompleted.mockResolvedValue({
      ...confirmation,
      status: 'COMPLETED',
      transactionId: 'transaction-id',
    });

    const firstResult = await service.handle(
      createContext({
        text: 'YA',
      }),
    );

    const secondResult = await service.handle(
      createContext({
        text: 'YA',
      }),
    );

    expect(confirmedTransactionService.create).toHaveBeenCalledTimes(1);

    expect(firstResult.status).toBe('COMPLETED');

    expect(secondResult.status).toBe('COMPLETED');

    expect(secondResult.message).toBe('ALREADY_PROCESSED');
  });

  it('should not process a confirmation already in processing state', async () => {
    const confirmation = createConfirmation({
      status: 'PROCESSING',
    });

    transactionConfirmationService.findLatestByChatId.mockResolvedValue(
      confirmation,
    );

    const result = await service.handle(
      createContext({
        text: 'YA',
      }),
    );

    expect(confirmedTransactionService.create).not.toHaveBeenCalled();

    expect(result.handled).toBe(true);
    expect(result.status).toBe('PROCESSING');
    expect(result.message).toBe('PROCESSING');
  });

  it('should return already processed for completed confirmation', async () => {
    const confirmation = createConfirmation({
      status: 'COMPLETED',
      transactionId: 'transaction-id',
    });

    transactionConfirmationService.findLatestByChatId.mockResolvedValue(
      confirmation,
    );

    const result = await service.handle(
      createContext({
        text: 'YA',
      }),
    );

    expect(confirmedTransactionService.create).not.toHaveBeenCalled();

    expect(result.handled).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.transactionId).toBe('transaction-id');
    expect(result.message).toBe('ALREADY_PROCESSED');
  });

  it('should keep confirmation in processing state when transaction creation fails', async () => {
    const confirmation = createConfirmation();

    transactionConfirmationService.findLatestByChatId.mockResolvedValue(
      confirmation,
    );

    transactionConfirmationService.parseAction.mockReturnValue('CONFIRM');

    transactionConfirmationService.confirm.mockResolvedValue({
      ...confirmation,
      status: 'CONFIRMED',
    });

    transactionConfirmationService.markProcessing.mockResolvedValue({
      ...confirmation,
      status: 'PROCESSING',
    });

    confirmedTransactionService.create.mockRejectedValue(
      new Error('database failure'),
    );

    errorService.handle.mockReturnValue(
      'Status transaksi belum dapat dipastikan. Jangan kirim konfirmasi berulang; periksa daftar transaksi terlebih dahulu.',
    );

    const result = await service.handle(
      createContext({
        text: 'YA',
      }),
    );

    expect(result).toEqual({
      handled: true,
      action: 'CONFIRM',
      status: 'PROCESSING',
      message:
        'Status transaksi belum dapat dipastikan. Jangan kirim konfirmasi berulang; periksa daftar transaksi terlebih dahulu.',
    });

    expect(confirmedTransactionService.create).toHaveBeenCalledTimes(1);

    expect(transactionConfirmationService.markProcessing).toHaveBeenCalledWith(
      'confirmation-id',
    );

    expect(transactionConfirmationService.markCompleted).not.toHaveBeenCalled();

    expect(errorService.handle).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should return mapped domain error message', async () => {
    const confirmation = createConfirmation();

    transactionConfirmationService.findLatestByChatId.mockResolvedValue(
      confirmation,
    );

    transactionConfirmationService.parseAction.mockReturnValue('CONFIRM');

    transactionConfirmationService.confirm.mockResolvedValue({
      ...confirmation,
      status: 'CONFIRMED',
    });

    transactionConfirmationService.markProcessing.mockResolvedValue({
      ...confirmation,
      status: 'PROCESSING',
    });

    confirmedTransactionService.create.mockRejectedValue(
      new Error('unexpected database error'),
    );

    errorService.handle.mockReturnValue(
      'Akun keuangan yang dipilih sedang tidak aktif. Silakan gunakan akun lain.',
    );

    const result = await service.handle(
      createContext({
        text: 'YA',
      }),
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('CONFIRM');
    expect(result.status).toBe('PROCESSING');

    expect(result.message).toBe(
      'Akun keuangan yang dipilih sedang tidak aktif. Silakan gunakan akun lain.',
    );

    expect(transactionConfirmationService.markCompleted).not.toHaveBeenCalled();

    expect(errorService.handle).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should not process a confirmation twice when the confirmation is already confirmed', async () => {
    const confirmation = createConfirmation();

    transactionConfirmationService.findLatestByChatId.mockResolvedValue({
      ...confirmation,
      status: 'CONFIRMED',
    });

    const result = await service.handle(
      createContext({
        text: 'YA',
      }),
    );

    expect(result).toEqual({
      handled: true,
      action: 'NONE',
      status: 'CONFIRMED',
      message: 'CONFIRMED',
    });

    expect(
      transactionConfirmationMessageService.formatConfirmed,
    ).toHaveBeenCalledTimes(1);
    expect(transactionConfirmationService.confirm).not.toHaveBeenCalled();

    expect(
      transactionConfirmationService.markProcessing,
    ).not.toHaveBeenCalled();

    expect(confirmedTransactionService.create).not.toHaveBeenCalled();
  });
});
