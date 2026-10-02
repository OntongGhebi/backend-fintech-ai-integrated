import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { TELEGRAM_SECRET_HEADER } from '../constants/telegram.constants';
import { IncomingHttpHeaders } from 'node:http';

interface TelegramWebhookRequest {
  headers: IncomingHttpHeaders;
}

@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TelegramWebhookRequest>();

    const receivedSecret = this.getHeaderValue(
      request.headers[TELEGRAM_SECRET_HEADER],
    );

    const expectedSecret = this.configService.get<string>(
      'telegram.webhookSecret',
    );

    if (!expectedSecret) {
      throw new UnauthorizedException(
        'Telegram webhook secret is not configured',
      );
    }

    if (!receivedSecret) {
      throw new UnauthorizedException('Telegram webhook secret is missing');
    }

    if (!this.isSecretValid(receivedSecret, expectedSecret)) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }

    return true;
  }

  private getHeaderValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private isSecretValid(
    receivedSecret: string,
    expectedSecret: string,
  ): boolean {
    const receivedBuffer = Buffer.from(receivedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  }
}
