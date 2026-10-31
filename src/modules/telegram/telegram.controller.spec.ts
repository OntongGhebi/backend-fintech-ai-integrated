import { ConflictException, NotFoundException } from '@nestjs/common';
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

describe('TelegramController', () => {
  let controller: TelegramController;

  let telegramService: {
    handleUpdate: jest.Mock;
    sendMessage: jest.Mock;
  };

  let telegramUpdateParserService: {
    parse: jest.Mock;
  };

  let telegramAccountService: {
    createLinkCode: jest.Mock;
    completeLink: jest.Mock;
    findByUserId: jest.Mock;
    unlink: jest.Mock;
  };

  let telegramIncomingMessageService: {
    persist: jest.Mock;
  };

  let telegramMessageProcessingService: {
    process: jest.Mock;
  };

  const userId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const createUpdate = (text = 'makan siang 25000') => ({
    update_id: 1000,
    message: {
      message_id: 100,
      from: {
        id: 40777718,
        is_bot: false,
        first_name: 'Ghebi',
        last_name: 'Armando',
        username: 'ghebi',
      },
      chat: {
        id: 40777718,
        type: 'private',
      },
      date: 1750000000,
      text,
    },
  });

  const parsedMessage = {
    updateId: 1000,
    messageId: 100,
    telegramUserId: 40777718,
    chatId: 40777718,
    chatType: 'private' as const,
    text: 'makan siang 25000',
    messageDate: new Date(1750000000 * 1000),
    username: 'ghebi',
    firstName: 'Ghebi',
    lastName: 'Armando',
  };

  const createPersistedMessage = (overrides: Record<string, unknown> = {}) => ({
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    telegramAccountId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    userId,
    telegramUserId: BigInt(40777718),
    chatId: BigInt(40777718),
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
      sendMessage: jest.fn().mockResolvedValue({
        message_id: 200,
        chat: {
          id: 40777718,
          type: 'private',
        },
        date: 1750000000,
        text: 'Telegram response',
      }),
    };

    telegramUpdateParserService = {
      parse: jest.fn(),
    };

    telegramAccountService = {
      createLinkCode: jest.fn(),
      completeLink: jest.fn(),
      findByUserId: jest.fn(),
      unlink: jest.fn(),
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
      ],
    })
      .overrideGuard(TelegramWebhookGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

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

      expect(result).toEqual({ ok: true });

      expect(telegramIncomingMessageService.persist).toHaveBeenCalledWith(
        parsedMessage,
      );

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
      telegramUpdateParserService.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageService.persist.mockResolvedValue(
        createPersistedMessage({
          created: false,
          processingStatus: TelegramProcessingStatus.PROCESSED,
        }),
      );

      const result = await controller.handleWebhook(createUpdate() as any);

      expect(result).toEqual({ ok: true });

      expect(telegramMessageProcessingService.process).not.toHaveBeenCalled();
    });

    it('should ignore messages from unlinked Telegram users', async () => {
      telegramUpdateParserService.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageService.persist.mockResolvedValue(null);

      const result = await controller.handleWebhook(createUpdate() as any);

      expect(result).toEqual({ ok: true });

      expect(telegramMessageProcessingService.process).not.toHaveBeenCalled();
    });

    it('should not persist an unprocessable update', async () => {
      telegramUpdateParserService.parse.mockReturnValue(null);

      const result = await controller.handleWebhook(createUpdate() as any);

      expect(result).toEqual({ ok: true });

      expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();

      expect(telegramService.handleUpdate).toHaveBeenCalledWith(null);
    });

    it('should propagate parser errors', async () => {
      telegramUpdateParserService.parse.mockImplementation(() => {
        throw new Error('Invalid Telegram update');
      });

      await expect(
        controller.handleWebhook(createUpdate() as any),
      ).rejects.toThrow('Invalid Telegram update');
    });

    it('should propagate persistence errors', async () => {
      telegramUpdateParserService.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageService.persist.mockRejectedValue(
        new Error('Persistence failed'),
      );

      await expect(
        controller.handleWebhook(createUpdate() as any),
      ).rejects.toThrow('Persistence failed');
    });

    it('should propagate processing errors', async () => {
      telegramUpdateParserService.parse.mockReturnValue(parsedMessage);

      telegramIncomingMessageService.persist.mockResolvedValue(
        createPersistedMessage(),
      );

      telegramMessageProcessingService.process.mockRejectedValue(
        new Error('Processing failed'),
      );

      await expect(
        controller.handleWebhook(createUpdate() as any),
      ).rejects.toThrow('Processing failed');
    });

    it('should complete account linking when receiving /start CODE', async () => {
      const message = {
        ...parsedMessage,
        text: '/start 12345678',
      };

      telegramUpdateParserService.parse.mockReturnValue(message);

      telegramAccountService.completeLink.mockResolvedValue({
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        userId,
        telegramUserId: BigInt(40777718),
      });

      const result = await controller.handleWebhook(
        createUpdate('/start 12345678') as any,
      );

      expect(result).toEqual({ ok: true });

      expect(telegramAccountService.completeLink).toHaveBeenCalledWith(
        {
          telegramUserId: BigInt(40777718),
          telegramUsername: 'ghebi',
          firstName: 'Ghebi',
          lastName: 'Armando',
        },
        '12345678',
      );

      expect(telegramService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 40777718,
          text: expect.stringContaining('Akun Telegram berhasil dihubungkan'),
        }),
      );

      expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();

      expect(telegramMessageProcessingService.process).not.toHaveBeenCalled();
    });

    it('should reply when /start is sent without a code', async () => {
      const message = {
        ...parsedMessage,
        text: '/start',
      };

      telegramUpdateParserService.parse.mockReturnValue(message);

      const result = await controller.handleWebhook(
        createUpdate('/start') as any,
      );

      expect(result).toEqual({ ok: true });

      expect(telegramAccountService.completeLink).not.toHaveBeenCalled();

      expect(telegramService.sendMessage).toHaveBeenCalled();

      expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();
    });

    it('should reject an invalid code format without consuming a token', async () => {
      const message = {
        ...parsedMessage,
        text: '/start 123',
      };

      telegramUpdateParserService.parse.mockReturnValue(message);

      const result = await controller.handleWebhook(
        createUpdate('/start 123') as any,
      );

      expect(result).toEqual({ ok: true });

      expect(telegramAccountService.completeLink).not.toHaveBeenCalled();

      expect(telegramService.sendMessage).toHaveBeenCalled();
    });

    it('should reply when the linking code is invalid or expired', async () => {
      telegramUpdateParserService.parse.mockReturnValue({
        ...parsedMessage,
        text: '/start 12345678',
      });

      telegramAccountService.completeLink.mockRejectedValue(
        new NotFoundException('Telegram linking code is invalid or expired'),
      );

      const result = await controller.handleWebhook(
        createUpdate('/start 12345678') as any,
      );

      expect(result).toEqual({ ok: true });

      expect(telegramService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('tidak valid atau sudah kedaluwarsa'),
        }),
      );
    });

    it('should reply when the Telegram account belongs to another user', async () => {
      telegramUpdateParserService.parse.mockReturnValue({
        ...parsedMessage,
        text: '/start 12345678',
      });

      telegramAccountService.completeLink.mockRejectedValue(
        new ConflictException(
          'Telegram account is already linked to another user',
        ),
      );

      const result = await controller.handleWebhook(
        createUpdate('/start 12345678') as any,
      );

      expect(result).toEqual({ ok: true });

      expect(telegramService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'sudah terhubung dengan akun aplikasi lain',
          ),
        }),
      );
    });

    it('should not link an account from a group chat', async () => {
      const message = {
        ...parsedMessage,
        chatType: 'group' as const,
        text: '/start 12345678',
      };

      telegramUpdateParserService.parse.mockReturnValue(message);

      const result = await controller.handleWebhook(
        createUpdate('/start 12345678') as any,
      );

      expect(result).toEqual({ ok: true });

      expect(telegramAccountService.completeLink).not.toHaveBeenCalled();

      expect(telegramService.sendMessage).not.toHaveBeenCalled();

      expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();
    });

    it('should propagate unexpected linking errors', async () => {
      telegramUpdateParserService.parse.mockReturnValue({
        ...parsedMessage,
        text: '/start 12345678',
      });

      telegramAccountService.completeLink.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        controller.handleWebhook(createUpdate('/start 12345678') as any),
      ).rejects.toThrow('Database unavailable');
    });
  });

  describe('createLinkCode', () => {
    it('should create a linking code for the authenticated user', async () => {
      telegramAccountService.createLinkCode.mockResolvedValue({
        code: '12345678',
        expiresInSeconds: 600,
      });

      const result = await controller.createLinkCode(userId);

      expect(result).toEqual({
        code: '12345678',
        expiresInSeconds: 600,
      });

      expect(telegramAccountService.createLinkCode).toHaveBeenCalledWith(
        userId,
      );
    });
  });

  describe('getLinkedAccounts', () => {
    it('should return accounts belonging to the authenticated user', async () => {
      telegramAccountService.findByUserId.mockResolvedValue([]);

      await expect(controller.getLinkedAccounts(userId)).resolves.toEqual([]);

      expect(telegramAccountService.findByUserId).toHaveBeenCalledWith(userId);
    });
  });

  describe('unlinkAccount', () => {
    it('should unlink an account belonging to the authenticated user', async () => {
      telegramAccountService.unlink.mockResolvedValue({
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      });

      const accountId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

      await controller.unlinkAccount(userId, accountId);

      expect(telegramAccountService.unlink).toHaveBeenCalledWith(
        userId,
        accountId,
      );
    });
  });
});
