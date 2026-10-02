import { Test, TestingModule } from '@nestjs/testing';

import {
  TelegramMessageType,
  TelegramProcessingStatus,
} from '../../../generated/prisma/enums.js';

import { TelegramAccountService } from './services/telegram-account.service.js';
import { TelegramController } from './telegram.controller';
import { TelegramIncomingMessageService } from './services/telegram-incoming-message.service.js';
import { TelegramMessageProcessingService } from './services/telegram-message-processing.service.js';
import { TelegramService } from './services/telegram.service.js';
import { TelegramUpdateParserService } from './services/telegram-update-parser.service.js';
import { TelegramWebhookGuard } from './guards/telegram-webhook.guard.js';
import { ConfigService } from '@nestjs/config';

describe('TelegramController', () => {
  let controller: TelegramController;

  let telegramService: {
    handleUpdate: jest.Mock;
  };

  let telegramUpdateParserService: {
    parse: jest.Mock;
  };

  let telegramAccountService: {
    createLinkCode: jest.Mock;
  };

  let telegramIncomingMessageService: {
    persist: jest.Mock;
  };

  let telegramMessageProcessingService: {
    process: jest.Mock;
  };

  const createUpdate = (overrides: Record<string, unknown> = {}) => ({
    update_id: 1000,

    message: {
      message_id: 100,
      from: {
        id: 123456,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      chat: {
        id: 654321,
        type: 'private',
      },
      date: 1750000000,
      text: 'makan siang 25000',
    },

    ...overrides,
  });

  const parsedMessage = {
    telegramUserId: '123456',
    chatId: '654321',
    messageId: '100',
    text: 'makan siang 25000',
  };

  const createPersistedMessage = (overrides: Record<string, unknown> = {}) => ({
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',

    telegramAccountId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',

    userId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',

    telegramUserId: BigInt(123456),

    chatId: BigInt(654321),

    telegramMessageId: BigInt(100),

    messageType: TelegramMessageType.TEXT,

    content: 'makan siang 25000',

    processingStatus: TelegramProcessingStatus.RECEIVED,

    created: true,

    ...overrides,
  });

  beforeEach(async () => {
    telegramService = {
      handleUpdate: jest.fn(),
    };

    telegramUpdateParserService = {
      parse: jest.fn(),
    };

    telegramAccountService = {
      createLinkCode: jest.fn(),
    };

    telegramIncomingMessageService = {
      persist: jest.fn(),
    };

    telegramMessageProcessingService = {
      process: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],

      providers: [
        {
          provide: TelegramService,
          useValue: telegramService,
        },

        {
          provide: TelegramUpdateParserService,
          useValue: telegramUpdateParserService,
        },

        {
          provide: TelegramAccountService,
          useValue: telegramAccountService,
        },

        {
          provide: TelegramIncomingMessageService,
          useValue: telegramIncomingMessageService,
        },

        {
          provide: TelegramMessageProcessingService,
          useValue: telegramMessageProcessingService,
        },

        {
          provide: TelegramWebhookGuard,
          useValue: {
            canActivate: jest.fn().mockReturnValue(true),
          },
        },

        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'telegram.webhookSecret') {
                return 'test-webhook-secret';
              }

              return undefined;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<TelegramController>(TelegramController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('should parse, persist, and process a new Telegram message', async () => {
      const update = createUpdate();

      const persistedMessage = createPersistedMessage();

      telegramUpdateParserService.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageService.persist.mockResolvedValue(
        persistedMessage,
      );

      telegramMessageProcessingService.process.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(update as any);

      expect(result).toEqual({
        ok: true,
      });

      expect(telegramUpdateParserService.parse).toHaveBeenCalledTimes(1);

      expect(telegramUpdateParserService.parse).toHaveBeenCalledWith(update);

      expect(telegramIncomingMessageService.persist).toHaveBeenCalledTimes(1);

      expect(telegramIncomingMessageService.persist).toHaveBeenCalledWith(
        parsedMessage,
      );

      expect(telegramMessageProcessingService.process).toHaveBeenCalledTimes(1);

      expect(telegramMessageProcessingService.process).toHaveBeenCalledWith({
        messageId: persistedMessage.id,

        userId: persistedMessage.userId,

        telegramAccountId: persistedMessage.telegramAccountId,

        telegramUserId: persistedMessage.telegramUserId,

        chatId: persistedMessage.chatId,

        telegramMessageId: persistedMessage.telegramMessageId,

        messageType: persistedMessage.messageType,

        content: persistedMessage.content,
      });

      expect(telegramService.handleUpdate).toHaveBeenCalledWith(parsedMessage);
    });

    it('should not process a duplicate Telegram message', async () => {
      const update = createUpdate();

      const persistedMessage = createPersistedMessage({
        created: false,

        processingStatus: TelegramProcessingStatus.PROCESSED,
      });

      telegramUpdateParserService.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageService.persist.mockResolvedValue(
        persistedMessage,
      );

      const result = await controller.handleWebhook(update as any);

      expect(result).toEqual({
        ok: true,
      });

      expect(telegramIncomingMessageService.persist).toHaveBeenCalledWith(
        parsedMessage,
      );

      expect(telegramMessageProcessingService.process).not.toHaveBeenCalled();

      expect(telegramService.handleUpdate).toHaveBeenCalledWith(parsedMessage);
    });

    it('should not process when the Telegram account is not linked', async () => {
      const update = createUpdate();

      telegramUpdateParserService.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageService.persist.mockResolvedValue(null);

      const result = await controller.handleWebhook(update as any);

      expect(result).toEqual({
        ok: true,
      });

      expect(telegramIncomingMessageService.persist).toHaveBeenCalledWith(
        parsedMessage,
      );

      expect(telegramMessageProcessingService.process).not.toHaveBeenCalled();

      expect(telegramService.handleUpdate).toHaveBeenCalledWith(parsedMessage);
    });

    it('should not persist when the update is not processable', async () => {
      const update = createUpdate();

      telegramUpdateParserService.parse.mockReturnValue(null);

      const result = await controller.handleWebhook(update as any);

      expect(result).toEqual({
        ok: true,
      });

      expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();

      expect(telegramMessageProcessingService.process).not.toHaveBeenCalled();

      expect(telegramService.handleUpdate).toHaveBeenCalledWith(null);
    });

    it('should propagate parser errors', async () => {
      const update = createUpdate();

      telegramUpdateParserService.parse.mockImplementation(() => {
        throw new Error('Invalid Telegram update');
      });

      await expect(controller.handleWebhook(update as any)).rejects.toThrow(
        'Invalid Telegram update',
      );

      expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();

      expect(telegramMessageProcessingService.process).not.toHaveBeenCalled();
    });

    it('should propagate persistence errors', async () => {
      const update = createUpdate();

      telegramUpdateParserService.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageService.persist.mockRejectedValue(
        new Error('Persistence failed'),
      );

      await expect(controller.handleWebhook(update as any)).rejects.toThrow(
        'Persistence failed',
      );

      expect(telegramMessageProcessingService.process).not.toHaveBeenCalled();
    });

    it('should propagate processing errors', async () => {
      const update = createUpdate();

      const persistedMessage = createPersistedMessage();

      telegramUpdateParserService.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageService.persist.mockResolvedValue(
        persistedMessage,
      );

      telegramMessageProcessingService.process.mockRejectedValue(
        new Error('Processing failed'),
      );

      await expect(controller.handleWebhook(update as any)).rejects.toThrow(
        'Processing failed',
      );

      expect(telegramMessageProcessingService.process).toHaveBeenCalledTimes(1);

      expect(telegramService.handleUpdate).not.toHaveBeenCalled();
    });
  });

  describe('createLinkCode', () => {
    it('should create a Telegram linking code for the authenticated user', async () => {
      telegramAccountService.createLinkCode.mockResolvedValue({
        code: '12345678',
        expiresInSeconds: 600,
      });

      const request = {
        user: {
          sub: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        },
      };

      const result = await controller.createLinkCode(request);

      expect(result).toEqual({
        code: '12345678',
        expiresInSeconds: 600,
      });

      expect(telegramAccountService.createLinkCode).toHaveBeenCalledTimes(1);

      expect(telegramAccountService.createLinkCode).toHaveBeenCalledWith(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
      );
    });
  });
});
