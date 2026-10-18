import { Test, TestingModule } from '@nestjs/testing';

import { TelegramTransactionConfirmationRepository } from '../../repositories/telegram-transaction-confirmation.repository';
import {
  CreateTransactionConfirmationInput,
  PendingTransactionConfirmation,
} from '../types/transaction-confirmation.types';
import { TransactionConfirmationService } from './transaction-confirmation.service';

describe('TransactionConfirmationService', () => {
  let service: TransactionConfirmationService;

  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    findBySourceMessageId: jest.fn(),
    findPendingByChatId: jest.fn(),
    findLatestByChatId: jest.fn(),
    confirm: jest.fn(),
    markProcessing: jest.fn(),
    markCompleted: jest.fn(),
    cancel: jest.fn(),
  };

  const intent = {
    intent: 'CREATE_TRANSACTION' as const,
    transactionType: 'EXPENSE' as const,
    amount: 25000,
    description: 'beli makan',
    accountId: 'account-id',
    source: 'DETERMINISTIC' as const,
    confidence: 1,
    originalIntent: {
      intent: 'CREATE_TRANSACTION' as const,
      transactionType: 'EXPENSE' as const,
      amount: 25000,
      description: 'beli makan',
      accountHint: 'BCA',
      source: 'DETERMINISTIC' as const,
      confidence: 1,
    },
  };

  const confirmation: PendingTransactionConfirmation = {
    id: 'confirmation-id',
    userId: 'user-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: BigInt(123456),
    chatId: 'chat-id',
    sourceMessageId: 'message-id',
    intent,
    status: 'PENDING',
    createdAt: new Date('2026-09-26T10:00:00.000Z'),
    expiresAt: new Date('2026-09-26T10:05:00.000Z'),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionConfirmationService,
        {
          provide: TelegramTransactionConfirmationRepository,
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get(TransactionConfirmationService);
  });

  it('delegates creation to the repository', async () => {
    const input: CreateTransactionConfirmationInput = {
      userId: 'user-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: BigInt(123456),
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      intent,
    };
    repository.create.mockResolvedValue(confirmation);

    await expect(service.create(input)).resolves.toBe(confirmation);
    expect(repository.create).toHaveBeenCalledWith(input);
  });

  it('delegates confirmation lookups and state changes to the repository', async () => {
    repository.findById.mockResolvedValue(confirmation);
    repository.findBySourceMessageId.mockResolvedValue(confirmation);
    repository.findPendingByChatId.mockResolvedValue(confirmation);
    repository.findLatestByChatId.mockResolvedValue(confirmation);
    repository.confirm.mockResolvedValue(confirmation);
    repository.markProcessing.mockResolvedValue(confirmation);
    repository.markCompleted.mockResolvedValue(confirmation);
    repository.cancel.mockResolvedValue(confirmation);

    await expect(service.findById(confirmation.id)).resolves.toBe(confirmation);
    await expect(
      service.findBySourceMessageId('chat-id', 'message-id'),
    ).resolves.toBe(confirmation);
    await expect(service.findPendingByChatId('chat-id')).resolves.toBe(
      confirmation,
    );
    await expect(service.findLatestByChatId('chat-id')).resolves.toBe(
      confirmation,
    );
    await expect(service.confirm(confirmation.id)).resolves.toBe(confirmation);
    await expect(service.markProcessing(confirmation.id)).resolves.toBe(
      confirmation,
    );
    await expect(
      service.markCompleted(confirmation.id, 'transaction-id'),
    ).resolves.toBe(confirmation);
    await expect(service.cancel(confirmation.id)).resolves.toBe(confirmation);

    expect(repository.findById).toHaveBeenCalledWith(confirmation.id);
    expect(repository.findBySourceMessageId).toHaveBeenCalledWith(
      'chat-id',
      'message-id',
    );
    expect(repository.findPendingByChatId).toHaveBeenCalledWith('chat-id');
    expect(repository.findLatestByChatId).toHaveBeenCalledWith('chat-id');
    expect(repository.confirm).toHaveBeenCalledWith(confirmation.id);
    expect(repository.markProcessing).toHaveBeenCalledWith(confirmation.id);
    expect(repository.markCompleted).toHaveBeenCalledWith(
      confirmation.id,
      'transaction-id',
    );
    expect(repository.cancel).toHaveBeenCalledWith(confirmation.id);
  });

  it('parses confirmation and cancellation actions', () => {
    expect(service.parseAction('ya')).toBe('CONFIRM');
    expect(service.parseAction({ text: ' YES ' })).toBe('CONFIRM');
    expect(service.parseAction('batal')).toBe('CANCEL');
    expect(service.parseAction('tidak')).toBe('CANCEL');
    expect(service.parseAction('mungkin')).toBe('UNKNOWN');
  });
});
