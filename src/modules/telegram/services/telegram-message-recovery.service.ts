import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { TelegramMessageRepository } from '../repositories/telegram-message.repository';

export interface TelegramMessageRecoveryOptions {
  leaseTimeoutMs?: number;
}

export interface TelegramMessageRecoveryResult {
  recovered: number;
  failed: number;
}

@Injectable()
export class TelegramMessageRecoveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramMessageRecoveryService.name);

  static readonly DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000;

  static readonly MAX_PROCESSING_ATTEMPTS = 3;

  static readonly RECOVERY_INTERVAL_MS = 60 * 1000;

  private recoveryInterval?: ReturnType<typeof setInterval>;

  private scheduledRecoveryInProgress = false;

  constructor(
    private readonly telegramMessageRepository: TelegramMessageRepository,
  ) {}

  onModuleInit(): void {
    if (this.recoveryInterval) {
      return;
    }

    this.recoveryInterval = setInterval(() => {
      void this.runScheduledRecovery();
    }, TelegramMessageRecoveryService.RECOVERY_INTERVAL_MS);

    // Do not keep the Node.js process alive solely for this interval.
    this.recoveryInterval.unref?.();

    this.logger.log(
      `Telegram message recovery scheduled every ${TelegramMessageRecoveryService.RECOVERY_INTERVAL_MS}ms`,
    );
  }

  onModuleDestroy(): void {
    if (!this.recoveryInterval) {
      return;
    }

    clearInterval(this.recoveryInterval);
    this.recoveryInterval = undefined;
  }

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

  private async runScheduledRecovery(): Promise<void> {
    if (this.scheduledRecoveryInProgress) {
      return;
    }

    this.scheduledRecoveryInProgress = true;

    try {
      await this.recover();
    } catch (error) {
      this.logger.error(
        'Scheduled Telegram message recovery failed.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.scheduledRecoveryInProgress = false;
    }
  }
}
