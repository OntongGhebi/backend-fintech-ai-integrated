import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { TelegramTransactionConfirmationMaintenanceRepository } from '../repositories/telegram-transaction-confirmation-maintenance.repository';

export interface TelegramTransactionConfirmationRecoveryOptions {
  leaseTimeoutMs?: number;
}

export interface TelegramTransactionConfirmationRecoveryResult {
  recovered: number;
  expired: number;
}

@Injectable()
export class TelegramTransactionConfirmationRecoveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    TelegramTransactionConfirmationRecoveryService.name,
  );

  static readonly DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000;
  static readonly RECOVERY_INTERVAL_MS = 60 * 1000;

  private recoveryInterval?: ReturnType<typeof setInterval>;
  private scheduledRecoveryInProgress = false;

  constructor(
    private readonly maintenanceRepository: TelegramTransactionConfirmationMaintenanceRepository,
  ) {}

  onModuleInit(): void {
    if (this.recoveryInterval) {
      return;
    }

    this.recoveryInterval = setInterval(() => {
      void this.runScheduledRecovery();
    }, TelegramTransactionConfirmationRecoveryService.RECOVERY_INTERVAL_MS);

    this.recoveryInterval.unref?.();

    this.logger.log(
      `Telegram transaction confirmation recovery scheduled every ${TelegramTransactionConfirmationRecoveryService.RECOVERY_INTERVAL_MS}ms`,
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
    options: TelegramTransactionConfirmationRecoveryOptions = {},
  ): Promise<TelegramTransactionConfirmationRecoveryResult> {
    const leaseTimeoutMs =
      options.leaseTimeoutMs ??
      TelegramTransactionConfirmationRecoveryService.DEFAULT_LEASE_TIMEOUT_MS;

    if (!Number.isFinite(leaseTimeoutMs) || leaseTimeoutMs <= 0) {
      throw new Error('leaseTimeoutMs must be a positive finite number');
    }

    const now = new Date();
    const staleBefore = new Date(now.getTime() - leaseTimeoutMs);

    // Recover stale PROCESSING records first. Expiration runs second so that
    // a recovered confirmation whose expiry has passed becomes EXPIRED.
    const recovered =
      await this.maintenanceRepository.recoverStaleProcessing(staleBefore);

    const expired = await this.maintenanceRepository.expirePending(now);

    if (recovered > 0) {
      this.logger.warn(
        `Recovered ${recovered} stale Telegram transaction confirmation(s)`,
      );
    }

    if (expired > 0) {
      this.logger.log(
        `Expired ${expired} Telegram transaction confirmation(s)`,
      );
    }

    return { recovered, expired };
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
        'Scheduled Telegram transaction confirmation recovery failed.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.scheduledRecoveryInProgress = false;
    }
  }
}
