import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { TelegramAccountService } from './telegram-account.service';
import { TelegramController } from './telegram.controller';
import { TelegramIncomingMessageService } from './telegram-incoming-message.service';
import { TelegramService } from './telegram.service';
import { TelegramUpdateParserService } from './telegram-update-parser.service';
import { TelegramWebhookGuard } from './telegram-webhook.guard';
import { TelegramUpdateDto } from './dto/telegram-update.dto';
import { ParsedTelegramMessage } from './telegram-parser.types';

describe('TelegramController', () => {
  let controller: TelegramController;

  const telegramServiceMock = {
    handleUpdate: jest.fn(),
  };

  const telegramUpdateParserServiceMock = {
    parse: jest.fn(),
  };

  const telegramAccountServiceMock = {
    createLinkCode: jest.fn(),
  };

  const telegramIncomingMessageServiceMock = {
    persist: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [
        {
          provide: TelegramService,
          useValue: telegramServiceMock,
        },
        {
          provide: TelegramUpdateParserService,
          useValue: telegramUpdateParserServiceMock,
        },
        {
          provide: TelegramAccountService,
          useValue: telegramAccountServiceMock,
        },
        {
          provide: TelegramIncomingMessageService,
          useValue: telegramIncomingMessageServiceMock,
        },
        {
          provide: TelegramWebhookGuard,
          useFactory: () => ({
            canActivate: jest.fn().mockReturnValue(true),
          }),
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    controller = module.get<TelegramController>(TelegramController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('should parse, persist, and pass the Telegram message to the service', async () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      const parsedMessage: ParsedTelegramMessage = {
        updateId: 123456,
        messageId: 1,
        telegramUserId: 987654,
        chatId: 987654,
        chatType: 'private',
        text: 'makan siang 25000',
        messageDate: new Date('2026-09-24T10:00:00.000Z'),
        username: 'ghebi',
        firstName: 'Ghebi',
      };

      telegramUpdateParserServiceMock.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageServiceMock.persist.mockResolvedValue({
        id: 'telegram-message-id',
      });

      const result = await controller.handleWebhook(update);

      expect(telegramUpdateParserServiceMock.parse).toHaveBeenCalledTimes(1);

      expect(telegramUpdateParserServiceMock.parse).toHaveBeenCalledWith(
        update,
      );

      expect(telegramIncomingMessageServiceMock.persist).toHaveBeenCalledTimes(
        1,
      );

      expect(telegramIncomingMessageServiceMock.persist).toHaveBeenCalledWith(
        parsedMessage,
      );

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledTimes(1);

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledWith(
        parsedMessage,
      );

      expect(result).toEqual({
        ok: true,
      });
    });

    it('should not persist when the update is not processable', async () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      telegramUpdateParserServiceMock.parse.mockReturnValue(null);

      const result = await controller.handleWebhook(update);

      expect(telegramUpdateParserServiceMock.parse).toHaveBeenCalledWith(
        update,
      );

      expect(telegramIncomingMessageServiceMock.persist).not.toHaveBeenCalled();

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledTimes(1);

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledWith(null);

      expect(result).toEqual({
        ok: true,
      });
    });

    it('should propagate parser errors', async () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      telegramUpdateParserServiceMock.parse.mockImplementation(() => {
        throw new Error('Telegram update parsing failed');
      });

      await expect(controller.handleWebhook(update)).rejects.toThrow(
        'Telegram update parsing failed',
      );

      expect(telegramIncomingMessageServiceMock.persist).not.toHaveBeenCalled();

      expect(telegramServiceMock.handleUpdate).not.toHaveBeenCalled();
    });

    it('should propagate persistence errors', async () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      const parsedMessage: ParsedTelegramMessage = {
        updateId: 123456,
        messageId: 1,
        telegramUserId: 987654,
        chatId: 987654,
        chatType: 'private',
        text: 'makan siang 25000',
        messageDate: new Date('2026-09-24T10:00:00.000Z'),
        username: 'ghebi',
        firstName: 'Ghebi',
      };

      telegramUpdateParserServiceMock.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageServiceMock.persist.mockRejectedValue(
        new Error('Failed to persist Telegram message'),
      );

      await expect(controller.handleWebhook(update)).rejects.toThrow(
        'Failed to persist Telegram message',
      );

      expect(telegramIncomingMessageServiceMock.persist).toHaveBeenCalledWith(
        parsedMessage,
      );

      expect(telegramServiceMock.handleUpdate).not.toHaveBeenCalled();
    });
  });

  describe('createLinkCode', () => {
    it('should create a Telegram linking code for the authenticated user', async () => {
      const request = {
        user: {
          sub: '11111111-1111-1111-1111-111111111111',
        },
      };

      const result = {
        code: '12345678',
        expiresInSeconds: 600,
      };

      telegramAccountServiceMock.createLinkCode.mockResolvedValue(result);

      await expect(controller.createLinkCode(request)).resolves.toEqual(result);

      expect(telegramAccountServiceMock.createLinkCode).toHaveBeenCalledWith(
        request.user.sub,
      );
    });
  });
});
