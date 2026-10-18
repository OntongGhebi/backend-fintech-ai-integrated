import { Test, TestingModule } from '@nestjs/testing';

import { TelegramTransactionConfirmationRepository } from '../../repositories/telegram-transaction-confirmation.repository';
import { PendingTransactionConfirmation } from '../types/transaction-confirmation.types';
import { TransactionConfirmationMessageService } from './transaction-confirmation-message.service';
import { TransactionConfirmationReplyService } from './transaction-confirmation-reply.service';
import { TransactionConfirmationService } from './transaction-confirmation.service';

describe('TransactionConfirmationReplyService', () => {
  let service: TransactionConfirmationReplyService;
  let confirmationService: TransactionConfirmationService;

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

  const pending: PendingTransactionConfirmation = {
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
        TransactionConfirmationReplyService,
        TransactionConfirmationMessageService,
        {
          provide: TelegramTransactionConfirmationRepository,
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get(TransactionConfirmationReplyService);
    confirmationService = module.get(TransactionConfirmationService);
  });

  const createPending = () => {
    repository.findPendingByChatId.mockResolvedValue(pending);
  };

  it('should confirm a pending transaction when user replies YA', async () => {
    createPending();
    repository.confirm.mockResolvedValue({
      ...pending,
      status: 'CONFIRMED',
    });

    const result = await service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('CONFIRM');
    expect(result.message).toContain('Transaksi dikonfirmasi');
    expect(repository.confirm).toHaveBeenCalledWith(pending.id);
    await expect(
      confirmationService.findPendingByChatId('chat-id'),
    ).resolves.toBe(pending);
  });

  it('should cancel a pending transaction when user replies BATAL', async () => {
    createPending();
    repository.cancel.mockResolvedValue({
      ...pending,
      status: 'CANCELLED',
    });

    const result = await service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'BATAL',
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('CANCEL');
    expect(result.message).toContain('Transaksi dibatalkan');
    expect(repository.cancel).toHaveBeenCalledWith(pending.id);
  });

  it('should handle unknown confirmation action', async () => {
    createPending();

    const result = await service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'mungkin',
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('UNKNOWN');
    expect(result.message).toContain('belum memahami');
  });

  it('should return no pending confirmation when none exists', async () => {
    repository.findPendingByChatId.mockResolvedValue(undefined);

    const result = await service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    expect(result.handled).toBe(false);
    expect(result.message).toContain('Tidak ada transaksi');
  });

  it('should not allow another user to confirm the transaction', async () => {
    createPending();

    const result = await service.handle({
      userId: 'another-user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    expect(result.handled).toBe(false);
    expect(result.action).toBe('UNKNOWN');
    expect(repository.confirm).not.toHaveBeenCalled();
  });

  it('should normalize confirmation replies', async () => {
    createPending();
    repository.confirm.mockResolvedValue({
      ...pending,
      status: 'CONFIRMED',
    });

    const result = await service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: '   ya   ',
    });

    expect(result.action).toBe('CONFIRM');
  });

  it('should not process a second reply after confirmation', async () => {
    repository.findPendingByChatId
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(undefined);
    repository.confirm.mockResolvedValue({
      ...pending,
      status: 'CONFIRMED',
    });

    const first = await service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    const second = await service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    expect(first.action).toBe('CONFIRM');
    expect(second.handled).toBe(false);
    expect(repository.confirm).toHaveBeenCalledTimes(1);
  });
});
