import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomInt } from 'node:crypto';

import { RedisService } from '../../../../docker/redis/redis.service';

import {
  TELEGRAM_LINK_CODE_LENGTH,
  TELEGRAM_LINK_CODE_PREFIX,
  TELEGRAM_LINK_CODE_TTL_SECONDS,
} from '../constants/telegram.constants';

interface TelegramLinkTokenData {
  userId: string;
}

@Injectable()
export class TelegramLinkTokenService {
  constructor(private readonly redisService: RedisService) {}

  async create(userId: string): Promise<string> {
    const max = 10 ** TELEGRAM_LINK_CODE_LENGTH;

    const code = randomInt(0, max)
      .toString()
      .padStart(TELEGRAM_LINK_CODE_LENGTH, '0');

    const key = this.buildKey(code);

    const value = JSON.stringify({
      userId,
    } satisfies TelegramLinkTokenData);

    try {
      await this.redisService.set(key, value, TELEGRAM_LINK_CODE_TTL_SECONDS);
    } catch {
      throw new InternalServerErrorException(
        'Unable to create Telegram linking code',
      );
    }

    return code;
  }

  async consume(code: string): Promise<TelegramLinkTokenData | null> {
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      return null;
    }

    const key = this.buildKey(normalizedCode);

    try {
      const value = await this.redisService.getAndDelete(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as TelegramLinkTokenData;
    } catch {
      throw new InternalServerErrorException(
        'Unable to validate Telegram linking code',
      );
    }
  }

  private buildKey(code: string): string {
    return `${TELEGRAM_LINK_CODE_PREFIX}${code}`;
  }
}
