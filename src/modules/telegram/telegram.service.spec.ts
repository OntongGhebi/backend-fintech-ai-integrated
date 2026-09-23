import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import {
  TELEGRAM_API_BASE_URL,
  TELEGRAM_MAX_MESSAGE_LENGTH,
} from './telegram.constants';
import { TelegramService } from './telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;

  const configMock = {
    get: jest.fn(),
  };

  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: ConfigService,
          useValue: configMock,
        },
      ],
    }).compile();

    service = module.get(TelegramService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('getMe', () => {
    it('should call Telegram getMe API', async () => {
      configMock.get.mockReturnValue('test-bot-token');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          ok: true,
          result: {
            id: 123456,
            is_bot: true,
            first_name: 'Finance Bot',
            username: 'finance_test_bot',
          },
        }),
      }) as jest.Mock;

      const result = await service.getMe();

      expect(result).toEqual({
        id: 123456,
        is_bot: true,
        first_name: 'Finance Bot',
        username: 'finance_test_bot',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${TELEGRAM_API_BASE_URL}/bottest-bot-token/getMe`,
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  describe('setWebhook', () => {
    it('should configure the Telegram webhook', async () => {
      configMock.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          'telegram.botToken': 'test-bot-token',
          'telegram.webhookUrl': 'https://example.com/api/v1/telegram/webhook',
          'telegram.webhookSecret': 'test-webhook-secret',
        };

        return values[key];
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          ok: true,
          result: true,
        }),
      }) as jest.Mock;

      const result = await service.setWebhook();

      expect(result).toBe(true);

      expect(global.fetch).toHaveBeenCalledWith(
        `${TELEGRAM_API_BASE_URL}/bottest-bot-token/setWebhook`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            url: 'https://example.com/api/v1/telegram/webhook',
            secret_token: 'test-webhook-secret',
            allowed_updates: ['message'],
          }),
        }),
      );
    });

    it('should reject when webhook URL is missing', async () => {
      configMock.get.mockImplementation((key: string) => {
        if (key === 'telegram.webhookUrl') {
          return '';
        }

        return 'test-value';
      });

      await expect(service.setWebhook()).rejects.toThrow(
        'Telegram webhook URL is not configured',
      );
    });

    it('should reject when webhook secret is missing', async () => {
      configMock.get.mockImplementation((key: string) => {
        if (key === 'telegram.webhookSecret') {
          return '';
        }

        return 'test-value';
      });

      await expect(service.setWebhook()).rejects.toThrow(
        'Telegram webhook secret is not configured',
      );
    });
  });

  describe('deleteWebhook', () => {
    it('should delete the Telegram webhook', async () => {
      configMock.get.mockReturnValue('test-bot-token');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          ok: true,
          result: true,
        }),
      }) as jest.Mock;

      const result = await service.deleteWebhook(true);

      expect(result).toBe(true);

      expect(global.fetch).toHaveBeenCalledWith(
        `${TELEGRAM_API_BASE_URL}/bottest-bot-token/deleteWebhook`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            drop_pending_updates: true,
          }),
        }),
      );
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      configMock.get.mockReturnValue('test-bot-token');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          ok: true,
          result: {
            message_id: 10,
            chat: {
              id: 123,
              type: 'private',
            },
            date: 1234567890,
            text: 'Hello',
          },
        }),
      }) as jest.Mock;
    });

    it('should send a Telegram message', async () => {
      const result = await service.sendMessage({
        chatId: 123,
        text: 'Hello',
      });

      expect(result).toEqual({
        message_id: 10,
        chat: {
          id: 123,
          type: 'private',
        },
        date: 1234567890,
        text: 'Hello',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${TELEGRAM_API_BASE_URL}/bottest-bot-token/sendMessage`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            chat_id: 123,
            text: 'Hello',
          }),
        }),
      );
    });

    it('should reject an empty message', async () => {
      await expect(
        service.sendMessage({
          chatId: 123,
          text: '   ',
        }),
      ).rejects.toThrow('Telegram message cannot be empty');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject a message exceeding Telegram limit', async () => {
      const longMessage = 'a'.repeat(TELEGRAM_MAX_MESSAGE_LENGTH + 1);

      await expect(
        service.sendMessage({
          chatId: 123,
          text: longMessage,
        }),
      ).rejects.toThrow(
        `Telegram message exceeds the maximum length of ${TELEGRAM_MAX_MESSAGE_LENGTH} characters`,
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('API error handling', () => {
    it('should throw when bot token is missing', async () => {
      configMock.get.mockReturnValue('');

      await expect(service.getMe()).rejects.toThrow(
        'Telegram bot token is not configured',
      );
    });

    it('should throw when Telegram API returns an error', async () => {
      configMock.get.mockReturnValue('test-bot-token');

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
        json: jest.fn().mockResolvedValue({
          ok: false,
          error_code: 401,
          description: 'Unauthorized',
        }),
      }) as jest.Mock;

      await expect(service.getMe()).rejects.toThrow('Unauthorized');
    });

    it('should throw when Telegram returns invalid JSON', async () => {
      configMock.get.mockReturnValue('test-bot-token');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      }) as jest.Mock;

      await expect(service.getMe()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw when Telegram returns no result', async () => {
      configMock.get.mockReturnValue('test-bot-token');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          ok: true,
        }),
      }) as jest.Mock;

      await expect(service.getMe()).rejects.toThrow(
        'Telegram API returned an empty result',
      );
    });

    it('should throw when the request times out', async () => {
      configMock.get.mockReturnValue('test-bot-token');

      const abortError = new Error('The operation was aborted');

      abortError.name = 'AbortError';

      global.fetch = jest.fn().mockRejectedValue(abortError) as jest.Mock;

      await expect(service.getMe()).rejects.toThrow(
        'Telegram API request timed out',
      );
    });
  });
});
