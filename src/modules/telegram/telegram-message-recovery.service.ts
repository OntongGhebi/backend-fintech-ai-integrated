import { Injectable, Logger } from '@nestjs/common';

import { TelegramMessageRepository } from './repositories/telegram-message.repository';

export interface TelegramMessageRecoveryOptions {
  leaseTimeoutMs?: number;
}

export interface TelegramMessageRecoveryResult {
  recovered: number;
  failed: number;
}

@Injectable()
export class TelegramMessageRecoveryService {
  private readonly logger = new Logger(TelegramMessageRecoveryService.name);

  static readonly DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000;

  static readonly MAX_PROCESSING_ATTEMPTS = 3;

  constructor(
    private readonly telegramMessageRepository: TelegramMessageRepository,
  ) {}

  async recover(
    options: TelegramMessageRecoveryOptions = {},
  ): Promise<TelegramMessageRecoveryResult> {
    const leaseTimeoutMs =
      options.leaseTimeoutMs ??
      TelegramMessageRecoveryService.DEFAULT_LEASE_TIMEOUT_MS;

    if (!Number.isFinite(leaseTimeoutMs) || leaseTimeoutMs <= 0) {
      throw new Error('leaseTimeoutMs must be a positive finite number');
    }

    const staleBefore = new Date(Date.now() - leaseTimeoutMs);

    const result = await this.telegramMessageRepository.recoverStaleProcessing(
      staleBefore,
      TelegramMessageRecoveryService.MAX_PROCESSING_ATTEMPTS,
    );

    if (result.recovered > 0) {
      this.logger.log(
        `Recovered ${result.recovered} stale Telegram message(s)`,
      );
    }

    if (result.failed > 0) {
      this.logger.warn(
        `Marked ${result.failed} Telegram message(s) as FAILED after reaching the maximum processing attempts`,
      );
    }

    return result;
  }
}
