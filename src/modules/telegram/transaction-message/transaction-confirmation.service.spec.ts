import { TransactionConfirmationService } from './transaction-confirmation.service';

describe('TransactionConfirmationService', () => {
  let service: TransactionConfirmationService;

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
    service = new TransactionConfirmationService();
  });

  it('should create a pending confirmation', () => {
    const result = service.create({
      userId: 'user-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: 'telegram-user-id',
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      intent,
    });

    expect(result.id).toBeDefined();
    expect(result.userId).toBe('user-id');
    expect(result.chatId).toBe('chat-id');
    expect(result.status).toBe('PENDING');
    expect(result.intent).toEqual(intent);
    expect(result.expiresAt.getTime()).toBeGreaterThan(
      result.createdAt.getTime(),
    );
  });

  it('should find pending confirmation by chat id', () => {
    const created = service.create({
      userId: 'user-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: 'telegram-user-id',
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      intent,
    });

    const result = service.findPendingByChatId('chat-id');

    expect(result?.id).toBe(created.id);
    expect(result?.status).toBe('PENDING');
  });

  it('should return undefined when chat has no pending confirmation', () => {
    const result = service.findPendingByChatId('unknown-chat');

    expect(result).toBeUndefined();
  });

  it('should parse confirmation action', () => {
    expect(service.parseAction('ya')).toBe('CONFIRM');
    expect(service.parseAction('YA')).toBe('CONFIRM');
    expect(service.parseAction('yes')).toBe('CONFIRM');
    expect(service.parseAction('y')).toBe('CONFIRM');

    expect(service.parseAction('batal')).toBe('CANCEL');
    expect(service.parseAction('BATAL')).toBe('CANCEL');
    expect(service.parseAction('cancel')).toBe('CANCEL');
    expect(service.parseAction('tidak')).toBe('CANCEL');

    expect(service.parseAction('mungkin')).toBe('UNKNOWN');
  });

  it('should confirm a pending confirmation', () => {
    const created = service.create({
      userId: 'user-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: 'telegram-user-id',
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      intent,
    });

    const result = service.confirm(created.id);

    expect(result?.status).toBe('CONFIRMED');
  });

  it('should cancel a pending confirmation', () => {
    const created = service.create({
      userId: 'user-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: 'telegram-user-id',
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      intent,
    });

    const result = service.cancel(created.id);

    expect(result?.status).toBe('CANCELLED');
  });

  it('should not confirm an already cancelled confirmation', () => {
    const created = service.create({
      userId: 'user-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: 'telegram-user-id',
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      intent,
    });

    service.cancel(created.id);

    const result = service.confirm(created.id);

    expect(result?.status).toBe('CANCELLED');
  });

  it('should not cancel an already confirmed confirmation', () => {
    const created = service.create({
      userId: 'user-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: 'telegram-user-id',
      chatId: 'chat-id',
      sourceMessageId: 'message-id',
      intent,
    });

    service.confirm(created.id);

    const result = service.cancel(created.id);

    expect(result?.status).toBe('CONFIRMED');
  });

  it('should return undefined when confirming unknown confirmation', () => {
    const result = service.confirm('unknown-id');

    expect(result).toBeUndefined();
  });

  it('should return undefined when cancelling unknown confirmation', () => {
    const result = service.cancel('unknown-id');

    expect(result).toBeUndefined();
  });
});
