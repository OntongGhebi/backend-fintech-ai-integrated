import {
  TelegramMessageDirection,
  TelegramMessageType,
  TelegramProcessingStatus,
} from '../../../../generated/prisma/enums.js';

import { TelegramMessageRepository } from './telegram-message.repository';

describe('TelegramMessageRepository', () => {
  let repository: TelegramMessageRepository;

  let prisma: {
    telegramMessage: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      telegramMessage: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };

    repository = new TelegramMessageRepository(prisma as any);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should atomically claim a RECEIVED message', async () => {
    prisma.telegramMessage.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await repository.claimProcessing(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );

    expect(result).toBe(true);

    expect(prisma.telegramMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        processingStatus: TelegramProcessingStatus.RECEIVED,
      },
      data: {
        processingStatus: TelegramProcessingStatus.PROCESSING,
        processingStartedAt: expect.any(Date),
        processingAttempts: {
          increment: 1,
        },
      },
    });
  });

  it('should increment processing attempts atomically when claiming a message', async () => {
    prisma.telegramMessage.updateMany.mockResolvedValue({
      count: 1,
    });

    await repository.claimProcessing('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    const call = prisma.telegramMessage.updateMany.mock.calls[0][0];

    expect(call.data.processingAttempts).toEqual({
      increment: 1,
    });
  });

  it('should return false when the message was already claimed', async () => {
    prisma.telegramMessage.updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await repository.claimProcessing(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );

    expect(result).toBe(false);

    expect(prisma.telegramMessage.updateMany).toHaveBeenCalledTimes(1);
  });

  it('should not perform a processing attempt increment when the claim fails', async () => {
    prisma.telegramMessage.updateMany.mockResolvedValue({
      count: 0,
    });

    await repository.claimProcessing('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    expect(prisma.telegramMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        processingStatus: TelegramProcessingStatus.RECEIVED,
      },
      data: {
        processingStatus: TelegramProcessingStatus.PROCESSING,
        processingStartedAt: expect.any(Date),
        processingAttempts: {
          increment: 1,
        },
      },
    });
  });

  it('should clear processing lease when marking message as processed', async () => {
    prisma.telegramMessage.update.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      processingStatus: TelegramProcessingStatus.PROCESSED,
    });

    await repository.markProcessed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    expect(prisma.telegramMessage.update).toHaveBeenCalledWith({
      where: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      },
      data: {
        processingStatus: TelegramProcessingStatus.PROCESSED,
        processingStartedAt: null,
        processedAt: expect.any(Date),
      },
    });
  });

  it('should preserve processing attempts when marking message as processed', async () => {
    prisma.telegramMessage.update.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      processingStatus: TelegramProcessingStatus.PROCESSED,
      processingAttempts: 1,
    });

    await repository.markProcessed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    const call = prisma.telegramMessage.update.mock.calls[0][0];

    expect(call.data.processingAttempts).toBeUndefined();
  });

  it('should clear processing lease when marking message as failed', async () => {
    prisma.telegramMessage.update.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      processingStatus: TelegramProcessingStatus.FAILED,
    });

    await repository.markFailed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    expect(prisma.telegramMessage.update).toHaveBeenCalledWith({
      where: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      },
      data: {
        processingStatus: TelegramProcessingStatus.FAILED,
        processingStartedAt: null,
      },
    });
  });

  it('should preserve processing attempts when marking message as failed', async () => {
    prisma.telegramMessage.update.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      processingStatus: TelegramProcessingStatus.FAILED,
      processingAttempts: 2,
    });

    await repository.markFailed('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    const call = prisma.telegramMessage.update.mock.calls[0][0];

    expect(call.data.processingAttempts).toBeUndefined();
  });

  it('should clear processing lease when marking message as ignored', async () => {
    prisma.telegramMessage.update.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      processingStatus: TelegramProcessingStatus.IGNORED,
    });

    await repository.markIgnored('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    expect(prisma.telegramMessage.update).toHaveBeenCalledWith({
      where: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      },
      data: {
        processingStatus: TelegramProcessingStatus.IGNORED,
        processingStartedAt: null,
      },
    });
  });

  it('should create a Telegram message with RECEIVED as the default status', async () => {
    prisma.telegramMessage.create.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });

    await repository.create({
      telegramAccountId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      telegramMessageId: BigInt(100),
      chatId: BigInt(200),
      messageType: TelegramMessageType.TEXT,
      content: 'makan 25000',
      direction: TelegramMessageDirection.INCOMING,
    });

    expect(prisma.telegramMessage.create).toHaveBeenCalledWith({
      data: {
        telegramAccountId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        telegramMessageId: BigInt(100),
        chatId: BigInt(200),
        messageType: TelegramMessageType.TEXT,
        content: 'makan 25000',
        direction: TelegramMessageDirection.INCOMING,
        processingStatus: TelegramProcessingStatus.RECEIVED,
      },
    });
  });
});
