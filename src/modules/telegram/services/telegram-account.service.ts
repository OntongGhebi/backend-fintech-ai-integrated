import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { TelegramLinkTokenService } from './telegram-link-token.service';
import { TelegramAccountRepository } from '../repositories/telegram-account.repository';

export interface LinkTelegramAccountInput {
  telegramUserId: bigint;
  telegramUsername?: string;
  firstName?: string;
  lastName?: string;
}

export interface CreateTelegramLinkCodeResult {
  code: string;
  expiresInSeconds: number;
}

@Injectable()
export class TelegramAccountService {
  constructor(
    private readonly telegramAccountRepository: TelegramAccountRepository,
    private readonly telegramLinkTokenService: TelegramLinkTokenService,
  ) {}

  async findByTelegramUserId(telegramUserId: bigint) {
    return this.telegramAccountRepository.findByTelegramUserId(telegramUserId);
  }

  async findByUserId(userId: string) {
    return this.telegramAccountRepository.findByUserId(userId);
  }

  async createLinkCode(userId: string): Promise<CreateTelegramLinkCodeResult> {
    const code = await this.telegramLinkTokenService.create(userId);

    return {
      code,
      expiresInSeconds: 10 * 60,
    };
  }

  async completeLink(input: LinkTelegramAccountInput, code: string) {
    const token = await this.telegramLinkTokenService.consume(code);

    if (!token?.userId) {
      throw new NotFoundException(
        'Telegram linking code is invalid or expired',
      );
    }

    // The application user identity must come from the Redis token.
    // Never trust a userId supplied by the Telegram update.
    const userId = token.userId;

    const existingAccount = await this.findByTelegramUserId(
      input.telegramUserId,
    );

    if (existingAccount) {
      if (existingAccount.userId !== userId) {
        throw new ConflictException(
          'Telegram account is already linked to another user',
        );
      }

      if (existingAccount.isVerified && existingAccount.unlinkedAt === null) {
        return existingAccount;
      }

      return this.telegramAccountRepository.relink(existingAccount.id, {
        userId,
        telegramUsername: input.telegramUsername,
        firstName: input.firstName,
        lastName: input.lastName,
      });
    }

    return this.telegramAccountRepository.create({
      userId,
      telegramUserId: input.telegramUserId,
      telegramUsername: input.telegramUsername,
      firstName: input.firstName,
      lastName: input.lastName,
    });
  }

  async unlink(userId: string, telegramAccountId: string) {
    const accounts = await this.findByUserId(userId);

    const account = accounts.find((item) => item.id === telegramAccountId);

    if (!account) {
      throw new NotFoundException('Telegram account not found');
    }

    return this.telegramAccountRepository.unlink(telegramAccountId);
  }
}
