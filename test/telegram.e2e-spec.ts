import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';

import {
  TelegramMessageDirection,
  TelegramMessageType,
  TelegramProcessingStatus,
} from '../generated/prisma/enums.js';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { EmailVerificationService } from '../src/modules/auth/services/email-verification.service';
import { TelegramService } from '../src/modules/telegram/services/telegram.service.js';
import { TelegramMessageRepository } from '../src/modules/telegram/repositories/telegram-message.repository';

import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

describe('Telegram E2E', () => {
  let app: INestApplication;

  let prisma: PrismaService;
  let emailVerificationService: EmailVerificationService;
  let telegramMessageRepository: TelegramMessageRepository;

  let userId: string;
  let telegramAccountId: string;

  const userEmail = `telegram-e2e-${randomUUID()}@example.com`;

  const password = 'Password123!';

  const webhookSecret = 'test-telegram-webhook-secret';

  const telegramUserId = BigInt(987654321);
  const chatId = BigInt(987654321);

  let telegramMessageSequence = 100001;

  const telegramServiceMock = {
    getMe: jest.fn().mockResolvedValue({
      id: Number(telegramUserId),
      isBot: true,
      firstName: 'Test',
      username: 'test_bot',
    }),

    sendMessage: jest.fn().mockResolvedValue({
      messageId: Number(900001),
      chat: {
        id: Number(chatId),
        type: 'private',
      },
      date: Math.floor(Date.now() / 1000),
      text: 'Test response',
    }),

    setWebhook: jest.fn().mockResolvedValue(true),

    deleteWebhook: jest.fn().mockResolvedValue(true),

    handleUpdate: jest.fn(),
  };

  beforeAll(async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = webhookSecret;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TelegramService)
      .useValue(telegramServiceMock)
      .compile();

    app = await createE2EApp(moduleFixture.createNestApplication());

    prisma = app.get(PrismaService);

    emailVerificationService = app.get(EmailVerificationService);

    telegramMessageRepository = app.get(TelegramMessageRepository);

    /*
     * Create a real application user.
     *
     * TelegramAccount has a foreign-key relation
     * to User, so using a random UUID without creating
     * the corresponding User would violate the FK.
     */
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: userEmail,
        password,
        name: 'Telegram E2E User',
      })
      .expect(201);

    userId = registerResponse.body.id as string;

    const verificationToken =
      await emailVerificationService.createToken(userId);

    await emailVerificationService.verifyEmail(verificationToken);

    telegramAccountId = randomUUID();

    await prisma.telegramAccount.create({
      data: {
        id: telegramAccountId,
        userId,
        telegramUserId,
        telegramUsername: 'test_user',
        firstName: 'Test',
        lastName: 'User',
        isVerified: true,
        linkedAt: new Date(),
      },
    });

    await cleanupMessages();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupMessages();
  });

  afterAll(async () => {
    if (!app) {
      return;
    }

    await cleanupMessages();

    await prisma.telegramAccount.deleteMany({
      where: {
        id: telegramAccountId,
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: userId,
      },
    });

    await app.close();
  });

  async function cleanupMessages(): Promise<void> {
    if (!prisma || !telegramAccountId) {
      return;
    }

    await prisma.telegramMessage.deleteMany({
      where: {
        telegramAccountId,
      },
    });
  }

  function nextTelegramMessageId(): bigint {
    const messageId = telegramMessageSequence;

    telegramMessageSequence += 1;

    return BigInt(messageId);
  }

  function createTextUpdate(
    options: {
      messageId?: bigint;
      text?: string;
      updateId?: number;
    } = {},
  ) {
    const messageId = options.messageId ?? nextTelegramMessageId();

    return {
      update_id: options.updateId ?? Number(messageId),

      message: {
        message_id: Number(messageId),

        date: Math.floor(Date.now() / 1000),

        chat: {
          id: Number(chatId),
          type: 'private',
        },

        from: {
          id: Number(telegramUserId),
          is_bot: false,
          first_name: 'Test',
          username: 'test_user',
        },

        text: options.text ?? 'beli makan 25000',
      },
    };
  }

  async function createReceivedMessage(
    options: {
      telegramMessageId?: bigint;
      content?: string;
    } = {},
  ) {
    const telegramMessageId =
      options.telegramMessageId ?? nextTelegramMessageId();

    return telegramMessageRepository.create({
      telegramAccountId,
      telegramMessageId,
      chatId,
      messageType: TelegramMessageType.TEXT,
      content: options.content ?? 'makan 25000',
      direction: TelegramMessageDirection.INBOUND,
      processingStatus: TelegramProcessingStatus.RECEIVED,
    });
  }

  describe('POST /api/v1/telegram/webhook', () => {
    it('should reject a request without the Telegram webhook secret', async () => {
      const messageId = nextTelegramMessageId();

      await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .send(
          createTextUpdate({
            messageId,
          }),
        )
        .expect(401);

      const message = await telegramMessageRepository.findByTelegramMessageId(
        chatId,
        messageId,
      );

      expect(message).toBeNull();
    });

    it('should reject a request with an invalid Telegram webhook secret', async () => {
      const messageId = nextTelegramMessageId();

      await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', 'invalid-secret')
        .send(
          createTextUpdate({
            messageId,
          }),
        )
        .expect(401);

      const message = await telegramMessageRepository.findByTelegramMessageId(
        chatId,
        messageId,
      );

      expect(message).toBeNull();
    });

    it('should accept a valid Telegram webhook request and process the message', async () => {
      const messageId = nextTelegramMessageId();

      await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', webhookSecret)
        .send(
          createTextUpdate({
            messageId,
            text: 'beli makan 25000',
          }),
        )
        .expect(200);

      const message = await telegramMessageRepository.findByTelegramMessageId(
        chatId,
        messageId,
      );

      expect(message).not.toBeNull();

      expect(message).toEqual(
        expect.objectContaining({
          telegramAccountId,
          telegramMessageId: messageId,
          chatId,
          messageType: TelegramMessageType.TEXT,
          direction: TelegramMessageDirection.INBOUND,
          content: 'beli makan 25000',
          processingStatus: TelegramProcessingStatus.PROCESSED,
          processingAttempts: 1,
        }),
      );

      expect(message?.processingStartedAt).toBeNull();

      expect(message?.processedAt).toBeInstanceOf(Date);

      expect(telegramServiceMock.sendMessage).toHaveBeenCalled();

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledTimes(1);
    });

    it('should persist duplicate Telegram updates only once', async () => {
      const messageId = nextTelegramMessageId();

      const update = createTextUpdate({
        messageId,
      });

      await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', webhookSecret)
        .send(update)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', webhookSecret)
        .send(update)
        .expect(200);

      const messages = await prisma.telegramMessage.findMany({
        where: {
          telegramAccountId,
          telegramMessageId: messageId,
          chatId,
        },
      });

      expect(messages).toHaveLength(1);

      expect(messages[0].processingAttempts).toBe(1);
    });

    it('should process a persisted Telegram message through the processing lifecycle', async () => {
      const messageId = nextTelegramMessageId();

      await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', webhookSecret)
        .send(
          createTextUpdate({
            messageId,
            text: 'cek transaksi 50000',
          }),
        )
        .expect(200);

      const message = await telegramMessageRepository.findByTelegramMessageId(
        chatId,
        messageId,
      );

      expect(message).not.toBeNull();

      expect(message?.processingStatus).toBe(
        TelegramProcessingStatus.PROCESSED,
      );

      expect(message?.processingAttempts).toBe(1);

      expect(message?.processingStartedAt).toBeNull();

      expect(message?.processedAt).toBeInstanceOf(Date);

      expect(message?.content).toBe('cek transaksi 50000');
    });

    it('should handle an unsupported Telegram update without creating a message', async () => {
      const callbackUpdate = {
        update_id: 999999,

        callback_query: {
          id: 'callback-1',

          from: {
            id: Number(telegramUserId),
            is_bot: false,
            first_name: 'Test',
          },

          chat_instance: 'chat-instance',

          data: 'test',
        },
      };

      await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', webhookSecret)
        .send(callbackUpdate)
        .expect(200);

      const messages = await prisma.telegramMessage.findMany({
        where: {
          telegramAccountId,
        },
      });

      expect(messages).toHaveLength(0);

      expect(telegramServiceMock.handleUpdate).toHaveBeenCalledWith(null);
    });
  });

  describe('Telegram message persistence', () => {
    it('should preserve Telegram bigint identifiers', async () => {
      const messageId = nextTelegramMessageId();

      await telegramMessageRepository.create({
        telegramAccountId,
        telegramMessageId: messageId,
        chatId,
        messageType: TelegramMessageType.TEXT,
        content: 'test message',
        direction: TelegramMessageDirection.INBOUND,
      });

      const message = await telegramMessageRepository.findByTelegramMessageId(
        chatId,
        messageId,
      );

      expect(message).not.toBeNull();

      expect(typeof message?.telegramMessageId).toBe('bigint');

      expect(typeof message?.chatId).toBe('bigint');

      expect(message?.telegramMessageId).toBe(messageId);

      expect(message?.chatId).toBe(chatId);
    });

    it('should create new messages with RECEIVED status and zero attempts', async () => {
      const message = await createReceivedMessage();

      expect(message.processingStatus).toBe(TelegramProcessingStatus.RECEIVED);

      expect(message.processingAttempts).toBe(0);

      expect(message.processingStartedAt).toBeNull();

      expect(message.processedAt).toBeNull();
    });
  });

  describe('Telegram processing lifecycle', () => {
    it('should claim a received message exactly once', async () => {
      const message = await createReceivedMessage();

      const firstClaim = await telegramMessageRepository.claimProcessing(
        message.id,
      );

      const secondClaim = await telegramMessageRepository.claimProcessing(
        message.id,
      );

      expect(firstClaim).toBe(true);
      expect(secondClaim).toBe(false);

      const updated = await telegramMessageRepository.findById(message.id);

      expect(updated?.processingStatus).toBe(
        TelegramProcessingStatus.PROCESSING,
      );

      expect(updated?.processingAttempts).toBe(1);

      expect(updated?.processingStartedAt).toBeInstanceOf(Date);
    });

    it('should recover a stale processing message', async () => {
      const message = await createReceivedMessage();

      await telegramMessageRepository.claimProcessing(message.id);

      await prisma.telegramMessage.update({
        where: {
          id: message.id,
        },
        data: {
          processingStartedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      const recovered = await telegramMessageRepository.recoverStaleProcessing(
        new Date(Date.now() - 5 * 60 * 1000),
        3,
      );

      expect(recovered).toEqual({
        recovered: 1,
        failed: 0,
      });

      const updated = await telegramMessageRepository.findById(message.id);

      expect(updated?.processingStatus).toBe(TelegramProcessingStatus.RECEIVED);

      expect(updated?.processingStartedAt).toBeNull();

      expect(updated?.processingAttempts).toBe(1);
    });

    it('should mark an exhausted processing message as FAILED', async () => {
      const message = await createReceivedMessage();

      await prisma.telegramMessage.update({
        where: {
          id: message.id,
        },
        data: {
          processingStatus: TelegramProcessingStatus.PROCESSING,
          processingAttempts: 3,
          processingStartedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      const recovered = await telegramMessageRepository.recoverStaleProcessing(
        new Date(Date.now() - 5 * 60 * 1000),
        3,
      );

      expect(recovered).toEqual({
        recovered: 0,
        failed: 1,
      });

      const updated = await telegramMessageRepository.findById(message.id);

      expect(updated?.processingStatus).toBe(TelegramProcessingStatus.FAILED);

      expect(updated?.processingStartedAt).toBeNull();
    });
  });
});
