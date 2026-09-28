import { Prisma } from '../../../../generated/prisma/client';

import {
  TelegramMessageDirection,
  TelegramMessageType,
  TelegramProcessingStatus,
} from '../../../../generated/prisma/enums';

import { TelegramMessageRepository } from './telegram-message.repository';

describe('TelegramMessageRepository', () => {
  let repository: TelegramMessageRepository;

  let prisma: {
    telegramMessage: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const data = {
    telegramAccountId: 'telegram-account-id',
    telegramMessageId: BigInt(100),
    chatId: BigInt(200),
    messageType: TelegramMessageType.TEXT,
    content: 'makan 25000',
    direction: TelegramMessageDirection.INBOUND,
    processingStatus: TelegramProcessingStatus.RECEIVED,
  };

  beforeEach(() => {
    prisma = {
      telegramMessage: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    repository = new TelegramMessageRepository(prisma as any);
  });

  it('should create and report a new Telegram message', async () => {
    const message = {
      id: 'message-id',
    };

    prisma.telegramMessage.create.mockResolvedValue(message);

    const result = await repository.findOrCreate(data);

    expect(result).toEqual({
      message,
      created: true,
    });
  });

  it('should return the existing message when creation loses a unique race', async () => {
    const existingMessage = {
      id: 'existing-message-id',
    };

    prisma.telegramMessage.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: {
          target: ['chatId', 'telegramMessageId'],
        },
      }),
    );

    prisma.telegramMessage.findUnique.mockResolvedValue(existingMessage);

    const result = await repository.findOrCreate(data);

    expect(result).toEqual({
      message: existingMessage,
      created: false,
    });

    expect(prisma.telegramMessage.findUnique).toHaveBeenCalledWith({
      where: {
        chatId_telegramMessageId: {
          chatId: data.chatId,
          telegramMessageId: data.telegramMessageId,
        },
      },
    });
  });

  it('should claim a RECEIVED message atomically', async () => {
    prisma.telegramMessage.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await repository.claimProcessing('message-id');

    expect(result).toBe(true);

    expect(prisma.telegramMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'message-id',
        processingStatus: TelegramProcessingStatus.RECEIVED,
      },
      data: {
        processingStatus: TelegramProcessingStatus.PROCESSING,
      },
    });
  });

  it('should report false when another worker already claimed the message', async () => {
    prisma.telegramMessage.updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await repository.claimProcessing('message-id');

    expect(result).toBe(false);
  });
});
