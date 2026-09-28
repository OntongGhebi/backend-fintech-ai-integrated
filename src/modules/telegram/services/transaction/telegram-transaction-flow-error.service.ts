import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TelegramTransactionFlowErrorService {
  private readonly logger = new Logger(
    TelegramTransactionFlowErrorService.name,
  );

  handle(error: unknown): string {
    this.logger.error(
      'Telegram transaction flow failed',
      error instanceof Error ? error.stack : String(error),
    );

    return [
      '⚠️ Transaksi belum dapat diproses.',
      '',
      'Terjadi kesalahan saat memproses transaksi Anda.',
      'Silakan coba lagi.',
    ].join('\n');
  }
}
