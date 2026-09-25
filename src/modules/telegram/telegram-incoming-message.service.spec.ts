import {
  TelegramMessageDirection,
  TelegramMessageType,
  TelegramProcessingStatus,
} from '../../../generated/prisma/enums.js';

import { TelegramIncomingMessageService } from './telegram-incoming-message.service';

describe('TelegramIncomingMessageService', () => {
  let service: TelegramIncomingMessageService;

  let telegramAccountRepository: {
    findByTelegramUserId: jest.Mock;
  };

  let telegramMessageRepository: {
    findByTelegramMessageId: jest.Mock;
    create: jest.Mock;
  };

  const createParsedMessage = (overrides: Record<string, unknown> = {}) => ({
    telegramUserId: '987654',
    chatId: '987654',
    messageId: '1',
    text: 'makan siang 25000',
    ...overrides,
  });

  const createTelegramAccount = (overrides: Record<string, unknown> = {}) => ({
    id: 'account-id',
    userId: 'user-id',
    telegramUserId: BigInt(987654),
    telegramUsername: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isVerified: true,
    unlinkedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    telegramAccountRepository = {
      findByTelegramUserId: jest.fn(),
    };

    telegramMessageRepository = {
      findByTelegramMessageId: jest.fn(),
      create: jest.fn(),
    };

    service = new TelegramIncomingMessageService(
      telegramAccountRepository as any,
      telegramMessageRepository as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('persist', () => {
    it('should return null when Telegram account is not linked', async () => {
      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(null);

      const message = createParsedMessage();

      const result = await service.persist(message);

      expect(
        telegramAccountRepository.findByTelegramUserId,
      ).toHaveBeenCalledWith(BigInt(987654));

      expect(result).toBeNull();

      expect(
        telegramMessageRepository.findByTelegramMessageId,
      ).not.toHaveBeenCalled();

      expect(telegramMessageRepository.create).not.toHaveBeenCalled();
    });

    it('should persist a new text message from a linked Telegram account', async () => {
      const telegramAccount = createTelegramAccount();

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findByTelegramMessageId.mockResolvedValue(null);

      const createdMessage = {
        id: 'message-id',
        telegramAccountId: 'account-id',
        telegramMessageId: BigInt(1),
        chatId: BigInt(987654),
        messageType: TelegramMessageType.TEXT,
        content: 'makan siang 25000',
        direction: TelegramMessageDirection.INBOUND,
        processingStatus: TelegramProcessingStatus.RECEIVED,
      };

      telegramMessageRepository.create.mockResolvedValue(createdMessage);

      const message = createParsedMessage();

      const result = await service.persist(message);

      expect(telegramMessageRepository.create).toHaveBeenCalledWith({
        telegramAccountId: telegramAccount.id,
        telegramMessageId: BigInt(1),
        chatId: BigInt(987654),
        messageType: TelegramMessageType.TEXT,
        content: 'makan siang 25000',
        direction: TelegramMessageDirection.INBOUND,
        processingStatus: TelegramProcessingStatus.RECEIVED,
      });

      expect(result).toEqual({
        id: 'message-id',
        telegramAccountId: 'account-id',
        userId: 'user-id',
        telegramUserId: BigInt(987654),
        chatId: BigInt(987654),
        telegramMessageId: BigInt(1),
        messageType: TelegramMessageType.TEXT,
        content: 'makan siang 25000',
        processingStatus: TelegramProcessingStatus.RECEIVED,
        created: true,
      });
    });

    it('should persist a command message as COMMAND', async () => {
      const telegramAccount = createTelegramAccount();

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findByTelegramMessageId.mockResolvedValue(null);

      telegramMessageRepository.create.mockResolvedValue({
        id: 'command-message-id',
        telegramAccountId: 'account-id',
        telegramMessageId: BigInt(2),
        chatId: BigInt(987654),
        messageType: TelegramMessageType.COMMAND,
        content: '/start',
        direction: TelegramMessageDirection.INBOUND,
        processingStatus: TelegramProcessingStatus.RECEIVED,
      });

      const result = await service.persist(
        createParsedMessage({
          messageId: '2',
          text: '/start',
        }),
      );

      expect(result).toEqual({
        id: 'command-message-id',
        telegramAccountId: 'account-id',
        userId: 'user-id',
        telegramUserId: BigInt(987654),
        chatId: BigInt(987654),
        telegramMessageId: BigInt(2),
        messageType: TelegramMessageType.COMMAND,
        content: '/start',
        processingStatus: TelegramProcessingStatus.RECEIVED,
        created: true,
      });
    });

    it('should persist a message without text as OTHER', async () => {
      const telegramAccount = createTelegramAccount();

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findByTelegramMessageId.mockResolvedValue(null);

      telegramMessageRepository.create.mockResolvedValue({
        id: 'other-message-id',
        telegramAccountId: 'account-id',
        telegramMessageId: BigInt(3),
        chatId: BigInt(987654),
        messageType: TelegramMessageType.OTHER,
        content: undefined,
        direction: TelegramMessageDirection.INBOUND,
        processingStatus: TelegramProcessingStatus.RECEIVED,
      });

      const result = await service.persist(
        createParsedMessage({
          messageId: '3',
          text: undefined,
        }),
      );

      expect(telegramMessageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: TelegramMessageType.OTHER,
          content: undefined,
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'other-message-id',
          messageType: TelegramMessageType.OTHER,
          created: true,
        }),
      );
    });

    it('should return the existing message when the Telegram message is already persisted', async () => {
      const telegramAccount = createTelegramAccount();

      const existingMessage = {
        id: 'existing-message-id',
        telegramAccountId: 'account-id',
        telegramMessageId: BigInt(1),
        chatId: BigInt(987654),
        messageType: TelegramMessageType.TEXT,
        content: 'makan siang 25000',
        direction: TelegramMessageDirection.INBOUND,
        processingStatus: TelegramProcessingStatus.PROCESSED,
      };

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findByTelegramMessageId.mockResolvedValue(
        existingMessage,
      );

      const result = await service.persist(createParsedMessage());

      expect(result).toEqual({
        id: 'existing-message-id',
        telegramAccountId: 'account-id',
        userId: 'user-id',
        telegramUserId: BigInt(987654),
        chatId: BigInt(987654),
        telegramMessageId: BigInt(1),
        messageType: TelegramMessageType.TEXT,
        content: 'makan siang 25000',
        processingStatus: TelegramProcessingStatus.PROCESSED,
        created: false,
      });

      expect(telegramMessageRepository.create).not.toHaveBeenCalled();
    });

    it('should preserve FAILED status for an existing message', async () => {
      const telegramAccount = createTelegramAccount();

      const existingMessage = {
        id: 'failed-message-id',
        telegramAccountId: 'account-id',
        telegramMessageId: BigInt(1),
        chatId: BigInt(987654),
        messageType: TelegramMessageType.TEXT,
        content: 'makan siang 25000',
        direction: TelegramMessageDirection.INBOUND,
        processingStatus: TelegramProcessingStatus.FAILED,
      };

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findByTelegramMessageId.mockResolvedValue(
        existingMessage,
      );

      const result = await service.persist(createParsedMessage());

      expect(result).toEqual(
        expect.objectContaining({
          id: 'failed-message-id',
          processingStatus: TelegramProcessingStatus.FAILED,
          created: false,
        }),
      );
    });

    it('should use the Telegram message id and chat id as bigint', async () => {
      const telegramAccount = createTelegramAccount();

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findByTelegramMessageId.mockResolvedValue(null);

      telegramMessageRepository.create.mockResolvedValue({
        id: 'message-id',
        telegramAccountId: 'account-id',
        telegramMessageId: BigInt(123),
        chatId: BigInt(456),
        messageType: TelegramMessageType.TEXT,
        content: 'gaji 5000000',
        direction: TelegramMessageDirection.INBOUND,
        processingStatus: TelegramProcessingStatus.RECEIVED,
      });

      await service.persist(
        createParsedMessage({
          telegramUserId: '987654',
          chatId: '456',
          messageId: '123',
          text: 'gaji 5000000',
        }),
      );

      expect(
        telegramMessageRepository.findByTelegramMessageId,
      ).toHaveBeenCalledWith(BigInt(456), BigInt(123));
    });
  });
});
