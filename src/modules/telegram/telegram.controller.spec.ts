import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import type { TelegramUpdate } from './telegram.types';

describe('TelegramController', () => {
  let controller: TelegramController;

  const telegramServiceMock = {
    handleUpdate: jest.fn(),
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
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    controller = module.get(TelegramController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('should pass the Telegram update to the service', () => {
      const update: TelegramUpdate = {
        update_id: 123456,
        message: {
          message_id: 1,
          from: {
            id: 987654,
            is_bot: false,
            first_name: 'Ghebi',
            username: 'ghebi',
          },
          chat: {
            id: 987654,
            type: 'private',
            first_name: 'Ghebi',
            username: 'ghebi',
          },
          date: 1758630000,
          text: 'hello',
        },
      };

      telegramServiceMock.handleUpdate.mockReturnValue(undefined);

      const result = controller.handleWebhook(update);

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledTimes(1);

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledWith(update);

      expect(result).toEqual({
        ok: true,
      });
    });

    it('should propagate service errors', () => {
      const update: TelegramUpdate = {
        update_id: 123456,
      };

      telegramServiceMock.handleUpdate.mockImplementation(() => {
        throw new Error('Telegram update processing failed');
      });

      expect(() => controller.handleWebhook(update)).toThrow(
        'Telegram update processing failed',
      );
    });
  });
});
