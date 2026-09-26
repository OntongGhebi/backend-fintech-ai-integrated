import { TransactionConfirmationReplyService } from './transaction-confirmation-reply.service';
import { TransactionConfirmationService } from './transaction-confirmation.service';
import { TransactionConfirmationMessageService } from './transaction-confirmation-message.service';

describe('TransactionConfirmationReplyService', () => {
  let service: TransactionConfirmationReplyService;
  let confirmationService: TransactionConfirmationService;
  let messageService: TransactionConfirmationMessageService;

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

  beforeEach(() => {
    confirmationService = new TransactionConfirmationService();

    messageService = new TransactionConfirmationMessageService();

    service = new TransactionConfirmationReplyService(
      confirmationService,
      messageService,
    );
  });

  const createPending = () =>
    confirmationService.create({
      userId: 'user-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: 'telegram-user-id',
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      intent,
    });

  it('should confirm a pending transaction when user replies YA', () => {
    const pending = createPending();

    const result = service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('CONFIRM');
    expect(result.message).toContain('Transaksi dikonfirmasi');

    expect(confirmationService.findPendingByChatId('chat-id')).toBeUndefined();

    expect(confirmationService.confirm(pending.id)?.status).toBe('CONFIRMED');
  });

  it('should cancel a pending transaction when user replies BATAL', () => {
    const pending = createPending();

    const result = service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'BATAL',
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('CANCEL');
    expect(result.message).toContain('Transaksi dibatalkan');

    expect(confirmationService.confirm(pending.id)?.status).toBe('CANCELLED');
  });

  it('should handle unknown confirmation action', () => {
    createPending();

    const result = service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'mungkin',
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('UNKNOWN');
    expect(result.message).toContain('belum memahami');
  });

  it('should return no pending confirmation when none exists', () => {
    const result = service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    expect(result.handled).toBe(false);
    expect(result.message).toContain('Tidak ada transaksi');
  });

  it('should not allow another user to confirm the transaction', () => {
    createPending();

    const result = service.handle({
      userId: 'another-user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    expect(result.handled).toBe(false);
    expect(result.action).toBe('UNKNOWN');

    expect(confirmationService.findPendingByChatId('chat-id')).toBeDefined();
  });

  it('should normalize confirmation replies', () => {
    createPending();

    const result = service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: '   ya   ',
    });

    expect(result.action).toBe('CONFIRM');
  });

  it('should not process a second reply after confirmation', () => {
    createPending();

    const first = service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    const second = service.handle({
      userId: 'user-id',
      chatId: 'chat-id',
      text: 'YA',
    });

    expect(first.action).toBe('CONFIRM');
    expect(second.handled).toBe(false);
  });
});
