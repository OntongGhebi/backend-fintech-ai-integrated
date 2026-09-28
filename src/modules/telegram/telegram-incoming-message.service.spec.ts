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
    findOrCreate: jest.Mock;
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

  const createPersistedMessage = (overrides: Record<string, unknown> = {}) => ({
    id: 'message-id',
    telegramAccountId: 'account-id',
    telegramMessageId: BigInt(1),
    chatId: BigInt(987654),
    messageType: TelegramMessageType.TEXT,
    content: 'makan siang 25000',
    direction: TelegramMessageDirection.INBOUND,
    processingStatus: TelegramProcessingStatus.RECEIVED,
    ...overrides,
  });

  beforeEach(() => {
    telegramAccountRepository = {
      findByTelegramUserId: jest.fn(),
    };

    telegramMessageRepository = {
      findOrCreate: jest.fn(),
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

      const result = await service.persist(createParsedMessage());

      expect(
        telegramAccountRepository.findByTelegramUserId,
      ).toHaveBeenCalledWith(BigInt(987654));

      expect(result).toBeNull();

      expect(telegramMessageRepository.findOrCreate).not.toHaveBeenCalled();
    });

    it('should persist a new text message from a linked Telegram account', async () => {
      const telegramAccount = createTelegramAccount();

      const createdMessage = createPersistedMessage();

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findOrCreate.mockResolvedValue({
        message: createdMessage,
        created: true,
      });

      const result = await service.persist(createParsedMessage());

      expect(telegramMessageRepository.findOrCreate).toHaveBeenCalledWith({
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

    it('should return an existing message without creating another record', async () => {
      const telegramAccount = createTelegramAccount();

      const existingMessage = createPersistedMessage({
        id: 'existing-message-id',
        processingStatus: TelegramProcessingStatus.PROCESSED,
      });

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findOrCreate.mockResolvedValue({
        message: existingMessage,
        created: false,
      });

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
    });

    it('should persist a command message as COMMAND', async () => {
      const telegramAccount = createTelegramAccount();

      const createdMessage = createPersistedMessage({
        id: 'command-message-id',
        telegramMessageId: BigInt(2),
        messageType: TelegramMessageType.COMMAND,
        content: '/start',
      });

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findOrCreate.mockResolvedValue({
        message: createdMessage,
        created: true,
      });

      const result = await service.persist(
        createParsedMessage({
          messageId: '2',
          text: '/start',
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'command-message-id',
          messageType: TelegramMessageType.COMMAND,
          created: true,
        }),
      );
    });

    it('should persist a message without text as OTHER', async () => {
      const telegramAccount = createTelegramAccount();

      const createdMessage = createPersistedMessage({
        id: 'other-message-id',
        telegramMessageId: BigInt(3),
        messageType: TelegramMessageType.OTHER,
        content: null,
      });

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findOrCreate.mockResolvedValue({
        message: createdMessage,
        created: true,
      });

      const result = await service.persist(
        createParsedMessage({
          messageId: '3',
          text: undefined,
        }),
      );

      expect(telegramMessageRepository.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: TelegramMessageType.OTHER,
          content: undefined,
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'other-message-id',
          messageType: TelegramMessageType.OTHER,
          content: undefined,
          created: true,
        }),
      );
    });

    it('should preserve FAILED status for an existing message', async () => {
      const telegramAccount = createTelegramAccount();

      const existingMessage = createPersistedMessage({
        id: 'failed-message-id',
        processingStatus: TelegramProcessingStatus.FAILED,
      });

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findOrCreate.mockResolvedValue({
        message: existingMessage,
        created: false,
      });

      const result = await service.persist(createParsedMessage());

      expect(result).toEqual(
        expect.objectContaining({
          id: 'failed-message-id',
          processingStatus: TelegramProcessingStatus.FAILED,
          created: false,
        }),
      );
    });

    it('should preserve Telegram identifiers as bigint', async () => {
      const telegramAccount = createTelegramAccount();

      telegramAccountRepository.findByTelegramUserId.mockResolvedValue(
        telegramAccount,
      );

      telegramMessageRepository.findOrCreate.mockResolvedValue({
        message: createPersistedMessage({
          telegramMessageId: BigInt(123),
          chatId: BigInt(456),
          content: 'gaji 5000000',
        }),
        created: true,
      });

      await service.persist(
        createParsedMessage({
          telegramUserId: '987654',
          chatId: '456',
          messageId: '123',
          text: 'gaji 5000000',
        }),
      );

      expect(telegramMessageRepository.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          telegramMessageId: BigInt(123),
          chatId: BigInt(456),
        }),
      );
    });
  });
});
