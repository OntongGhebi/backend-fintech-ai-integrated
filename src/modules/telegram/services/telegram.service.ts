import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  TELEGRAM_API_BASE_URL,
  TELEGRAM_API_TIMEOUT_MS,
  TELEGRAM_MAX_MESSAGE_LENGTH,
} from '../constants/telegram.constants';
import {
  TelegramApiResponse,
  TelegramBot,
  TelegramSendMessageParams,
  TelegramSendMessageResponse,
  TelegramWebhookInfo,
} from '../types/telegram.types';
import { ParsedTelegramMessage } from '../types/telegram-parser.types';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly configService: ConfigService) {}

  async getMe(): Promise<TelegramBot> {
    return this.request<TelegramBot>('getMe', {});
  }

  async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return this.request<TelegramWebhookInfo>('getWebhookInfo', {});
  }

  async setWebhook(): Promise<boolean> {
    const webhookUrl = this.configService.get<string>('telegram.webhookUrl');

    if (!webhookUrl) {
      throw new InternalServerErrorException(
        'Telegram webhook URL is not configured',
      );
    }

    const webhookSecret = this.configService.get<string>(
      'telegram.webhookSecret',
    );

    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'Telegram webhook secret is not configured',
      );
    }

    const result = await this.request<boolean>('setWebhook', {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message'],
    });

    return result;
  }

  async deleteWebhook(dropPendingUpdates = false): Promise<boolean> {
    return this.request<boolean>('deleteWebhook', {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  async sendMessage(
    params: TelegramSendMessageParams,
  ): Promise<TelegramSendMessageResponse> {
    if (!params.text.trim()) {
      throw new InternalServerErrorException(
        'Telegram message cannot be empty',
      );
    }

    if (params.text.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      throw new InternalServerErrorException(
        `Telegram message exceeds the maximum length of ${TELEGRAM_MAX_MESSAGE_LENGTH} characters`,
      );
    }

    return this.request<TelegramSendMessageResponse>('sendMessage', {
      chat_id: params.chatId,
      text: params.text,
    });
  }

  handleUpdate(message: ParsedTelegramMessage | null): void {
    if (!message) {
      this.logger.debug(
        'Telegram update does not contain a processable text message',
      );

      return;
    }

    this.logger.debug(
      `Received Telegram message: update=${message.updateId}, chat=${message.chatId}, user=${message.telegramUserId}`,
    );
  }

  private async request<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const botToken = this.configService.get<string>('telegram.botToken');

    if (!botToken) {
      throw new InternalServerErrorException(
        'Telegram bot token is not configured',
      );
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, TELEGRAM_API_TIMEOUT_MS);

    const url = `${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      let payload: TelegramApiResponse<T>;

      try {
        payload = (await response.json()) as TelegramApiResponse<T>;
      } catch {
        throw new ServiceUnavailableException(
          'Telegram API returned an invalid response',
        );
      }

      if (!response.ok || !payload.ok) {
        this.logger.error(
          `Telegram API request failed: ${method} - ${
            payload.description ?? response.statusText
          }`,
        );

        throw new ServiceUnavailableException(
          payload.description ?? 'Telegram API request failed',
        );
      }

      if (payload.result === undefined) {
        throw new ServiceUnavailableException(
          'Telegram API returned an empty result',
        );
      }

      return payload.result;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`Telegram API request timed out: ${method}`);

        throw new ServiceUnavailableException('Telegram API request timed out');
      }

      this.logger.error(
        `Telegram API request failed: ${method}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException(
        'Unable to communicate with Telegram API',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
