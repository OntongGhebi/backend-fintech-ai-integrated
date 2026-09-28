import { BadRequestException } from '@nestjs/common';

import { TelegramTransactionFlowErrorService } from './telegram-transaction-flow-error.service';

describe('TelegramTransactionFlowErrorService', () => {
  let service: TelegramTransactionFlowErrorService;

  beforeEach(() => {
    service = new TelegramTransactionFlowErrorService();
  });

  it('should return a safe generic message for Error', () => {
    const result = service.handle(new Error('database connection failed'));

    expect(result).toBe(
      [
        '⚠️ Transaksi belum dapat diproses.',
        '',
        'Terjadi kesalahan saat memproses transaksi Anda.',
        'Silakan coba lagi.',
      ].join('\n'),
    );
  });

  it('should return a safe generic message for unknown error', () => {
    const result = service.handle({
      unexpected: true,
    });

    expect(result).toBe(
      [
        '⚠️ Transaksi belum dapat diproses.',
        '',
        'Terjadi kesalahan saat memproses transaksi Anda.',
        'Silakan coba lagi.',
      ].join('\n'),
    );
  });

  it('should not expose internal error details', () => {
    const result = service.handle(
      new Error('PrismaClientKnownRequestError: password=secret'),
    );

    expect(result).not.toContain('PrismaClient');
    expect(result).not.toContain('password');
    expect(result).not.toContain('secret');
  });

  it('should return a safe generic message for Nest exceptions', () => {
    const result = service.handle(
      new BadRequestException('internal validation detail'),
    );

    expect(result).toBe(
      [
        '⚠️ Transaksi belum dapat diproses.',
        '',
        'Terjadi kesalahan saat memproses transaksi Anda.',
        'Silakan coba lagi.',
      ].join('\n'),
    );
  });
});
