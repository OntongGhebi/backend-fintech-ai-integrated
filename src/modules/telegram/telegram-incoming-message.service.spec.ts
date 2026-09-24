import { Test, TestingModule } from '@nestjs/testing';

import {
  TelegramMessageDirection,
  TelegramProcessingStatus,
  TelegramMessageType,
} from '../../../generated/prisma/enums.js';

import { TelegramAccountRepository } from './repositories/telegram-account.repository';
import { TelegramMessageRepository } from './repositories/telegram-message.repository';
import { TelegramIncomingMessageService } from './telegram-incoming-message.service';
import { ParsedTelegramMessage } from './telegram-parser.types';

describe('TelegramIncomingMessageService', () => {
  let service: TelegramIncomingMessageService;

  const telegramAccountRepositoryMock = {
    findByTelegramUserId: jest.fn(),
  };

  const telegramMessageRepositoryMock = {
    findByTelegramMessageId: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramIncomingMessageService,
        {
          provide: TelegramAccountRepository,
          useValue: telegramAccountRepositoryMock,
        },
        {
          provide: TelegramMessageRepository,
          useValue: telegramMessageRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<TelegramIncomingMessageService>(
      TelegramIncomingMessageService,
    );
  });

  const createMessage = (
    overrides: Partial<ParsedTelegramMessage> = {},
  ): ParsedTelegramMessage => ({
    updateId: 123456,
    messageId: 1,
    telegramUserId: 987654,
    chatId: 987654,
    chatType: 'private',
    text: 'makan siang 25000',
    messageDate: new Date('2026-09-24T10:00:00.000Z'),
    username: 'ghebi',
    firstName: 'Ghebi',
    ...overrides,
  });

  it('should persist a message from a linked Telegram account', async () => {
    const message = createMessage();

    const telegramAccount = {
      id: 'account-id',
      userId: 'user-id',
      telegramUserId: BigInt(message.telegramUserId),
      isVerified: true,
      unlinkedAt: null,
    };

    const persistedMessage = {
      id: 'message-id',
    };

    telegramAccountRepositoryMock.findByTelegramUserId.mockResolvedValue(
      telegramAccount,
    );

    telegramMessageRepositoryMock.findByTelegramMessageId.mockResolvedValue(
      null,
    );

    telegramMessageRepositoryMock.create.mockResolvedValue(persistedMessage);

    const result = await service.persist(message);

    expect(
      telegramAccountRepositoryMock.findByTelegramUserId,
    ).toHaveBeenCalledWith(BigInt(message.telegramUserId));

    expect(
      telegramMessageRepositoryMock.findByTelegramMessageId,
    ).toHaveBeenCalledWith(BigInt(message.chatId), BigInt(message.messageId));

    expect(telegramMessageRepositoryMock.create).toHaveBeenCalledWith({
      telegramAccountId: telegramAccount.id,
      telegramMessageId: BigInt(message.messageId),
      chatId: BigInt(message.chatId),
      messageType: TelegramMessageType.TEXT,
      content: message.text,
      direction: TelegramMessageDirection.INBOUND,
      processingStatus: TelegramProcessingStatus.RECEIVED,
    });

    expect(result).toEqual(persistedMessage);
  });

  it('should persist a command as COMMAND message type', async () => {
    const message = createMessage({
      text: '/start',
    });

    telegramAccountRepositoryMock.findByTelegramUserId.mockResolvedValue({
      id: 'account-id',
      userId: 'user-id',
      telegramUserId: BigInt(message.telegramUserId),
      isVerified: true,
      unlinkedAt: null,
    });

    telegramMessageRepositoryMock.findByTelegramMessageId.mockResolvedValue(
      null,
    );

    telegramMessageRepositoryMock.create.mockResolvedValue({
      id: 'message-id',
    });

    await service.persist(message);

    expect(telegramMessageRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: TelegramMessageType.COMMAND,
      }),
    );
  });

  it('should not persist a message from an unlinked Telegram account', async () => {
    const message = createMessage();

    telegramAccountRepositoryMock.findByTelegramUserId.mockResolvedValue(null);

    const result = await service.persist(message);

    expect(result).toBeNull();

    expect(
      telegramMessageRepositoryMock.findByTelegramMessageId,
    ).not.toHaveBeenCalled();

    expect(telegramMessageRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('should return the existing message when the Telegram message is already persisted', async () => {
    const message = createMessage();

    const telegramAccount = {
      id: 'account-id',
      userId: 'user-id',
      telegramUserId: BigInt(message.telegramUserId),
      isVerified: true,
      unlinkedAt: null,
    };

    const existingMessage = {
      id: 'existing-message-id',
    };

    telegramAccountRepositoryMock.findByTelegramUserId.mockResolvedValue(
      telegramAccount,
    );

    telegramMessageRepositoryMock.findByTelegramMessageId.mockResolvedValue(
      existingMessage,
    );

    const result = await service.persist(message);

    expect(result).toEqual(existingMessage);

    expect(telegramMessageRepositoryMock.create).not.toHaveBeenCalled();
  });
});
