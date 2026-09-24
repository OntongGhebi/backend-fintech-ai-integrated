import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { TelegramAccountService } from './telegram-account.service';
import { TelegramController } from './telegram.controller';
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
    it('should parse the Telegram update and pass the parsed message to the service', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      const parsedMessage: ParsedTelegramMessage = {
        updateId: 123456,
        messageId: 1,
        telegramUserId: 987654,
        chatId: 987654,
        chatType: 'private',
        text: 'makan siang 25000',
        messageDate: new Date(1758630000 * 1000),
        username: 'ghebi',
        firstName: 'Ghebi',
      };

      telegramUpdateParserServiceMock.parse.mockReturnValue(parsedMessage);

      const result = controller.handleWebhook(update);

      expect(telegramUpdateParserServiceMock.parse).toHaveBeenCalledTimes(1);

      expect(telegramUpdateParserServiceMock.parse).toHaveBeenCalledWith(
        update,
      );

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledTimes(1);

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledWith(
        parsedMessage,
      );

      expect(result).toEqual({
        ok: true,
      });
    });

    it('should pass null when the update is not processable', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      telegramUpdateParserServiceMock.parse.mockReturnValue(null);

      const result = controller.handleWebhook(update);

      expect(telegramUpdateParserServiceMock.parse).toHaveBeenCalledWith(
        update,
      );

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledWith(null);

      expect(result).toEqual({
        ok: true,
      });
    });

    it('should propagate parser errors', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      telegramUpdateParserServiceMock.parse.mockImplementation(() => {
        throw new Error('Telegram update parsing failed');
      });

      expect(() => controller.handleWebhook(update)).toThrow(
        'Telegram update parsing failed',
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
