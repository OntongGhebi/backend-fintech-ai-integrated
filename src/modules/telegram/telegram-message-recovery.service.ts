import { Injectable, Logger } from '@nestjs/common';
import { TelegramMessageRepository } from './repositories/telegram-message.repository';

export interface TelegramMessageRecoveryOptions {
  leaseTimeoutMs?: number;
}

@Injectable()
export class TelegramMessageRecoveryService {
  private readonly logger = new Logger(TelegramMessageRecoveryService.name);

  private static readonly DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000;

  constructor(
    private readonly telegramMessageRepository: TelegramMessageRepository,
  ) {}

  async recover(options: TelegramMessageRecoveryOptions = {}): Promise<number> {
    const leaseTimeoutMs =
      options.leaseTimeoutMs ??
      TelegramMessageRecoveryService.DEFAULT_LEASE_TIMEOUT_MS;

    if (!Number.isFinite(leaseTimeoutMs) || leaseTimeoutMs <= 0) {
      throw new Error('leaseTimeoutMs must be a positive finite number');
    }

    const staleBefore = new Date(Date.now() - leaseTimeoutMs);

    const recovered =
      await this.telegramMessageRepository.recoverStaleProcessing(staleBefore);

    if (recovered > 0) {
      this.logger.log(`Recovered ${recovered} stale Telegram message(s)`);
    }

    return recovered;
  }
}
