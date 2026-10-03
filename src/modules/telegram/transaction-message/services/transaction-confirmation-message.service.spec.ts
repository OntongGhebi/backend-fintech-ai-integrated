import { TransactionConfirmationMessageService } from './transaction-confirmation-message.service';

describe('TransactionConfirmationMessageService', () => {
  let service: TransactionConfirmationMessageService;

  beforeEach(() => {
    service = new TransactionConfirmationMessageService();
  });

  const confirmation = {
    id: 'confirmation-id',
    userId: 'user-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: 'telegram-user-id',
    chatId: 'chat-id',
    sourceMessageId: 'message-id',
    status: 'PENDING' as const,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    intent: {
      intent: 'CREATE_TRANSACTION' as const,
      transactionType: 'EXPENSE' as const,
      amount: 25000,
      description: 'beli makan',
      accountId: 'account-id',
      categoryId: 'category-id',
      source: 'DETERMINISTIC' as const,
      confidence: 1,
      originalIntent: {
        intent: 'CREATE_TRANSACTION' as const,
        transactionType: 'EXPENSE' as const,
        amount: 25000,
        description: 'beli makan',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        source: 'DETERMINISTIC' as const,
        confidence: 1,
      },
    },
  };

  it('should format pending transaction confirmation', () => {
    const result = service.format(confirmation);

    expect(result).toContain('Konfirmasi transaksi');
    expect(result).toContain('Pengeluaran');
    expect(result).toContain('Rp25.000');
    expect(result).toContain('beli makan');
    expect(result).toContain('YA');
    expect(result).toContain('BATAL');
  });

  it('should format confirmed message', () => {
    expect(service.formatConfirmed()).toContain('Transaksi dikonfirmasi');
  });

  it('should format cancelled message', () => {
    expect(service.formatCancelled()).toContain('Transaksi dibatalkan');
  });

  it('should format expired message', () => {
    expect(service.formatExpired()).toContain('kedaluwarsa');
  });

  it('should format no pending message', () => {
    expect(service.formatNoPendingConfirmation()).toContain(
      'Tidak ada transaksi',
    );
  });

  it('should format unknown action message', () => {
    expect(service.formatUnknownAction()).toContain('belum memahami');
  });

  it('should indicate when a transaction was processed through AI', () => {
    const aiConfirmation = {
      ...confirmation,
      intent: {
        ...confirmation.intent,
        processingSource: 'AI' as const,
      },
    };

    const result = service.format(aiConfirmation);

    expect(result).toContain('🤖 Transaksi dipahami menggunakan AI.');
  });

  it('should not indicate AI processing for deterministic transactions', () => {
    const deterministicConfirmation = {
      ...confirmation,
      intent: {
        ...confirmation.intent,
        processingSource: 'DETERMINISTIC' as const,
      },
    };

    const result = service.format(deterministicConfirmation);

    expect(result).not.toContain('🤖 Transaksi dipahami menggunakan AI.');
  });
});
