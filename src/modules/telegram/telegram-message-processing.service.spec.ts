import {
  TelegramMessageType,
  TelegramProcessingStatus,
} from '../../../generated/prisma/enums.js';

import { TelegramMessageProcessingService } from './telegram-message-processing.service';

describe('TelegramMessageProcessingService', () => {
  let service: TelegramMessageProcessingService;

  let telegramMessageRepository: {
    findById: jest.Mock;
    markProcessing: jest.Mock;
    markProcessed: jest.Mock;
    markFailed: jest.Mock;
  };

  let telegramMessageDispatcherService: {
    dispatch: jest.Mock;
  };

  const createInput = () => ({
    messageId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',

    userId: '11111111-1111-1111-1111-111111111111',

    telegramAccountId: '22222222-2222-2222-2222-222222222222',

    telegramUserId: BigInt(123456),

    chatId: BigInt(654321),

    telegramMessageId: BigInt(100),

    messageType: TelegramMessageType.TEXT,

    content: 'makan siang 25000',
  });

  beforeEach(() => {
    telegramMessageRepository = {
      findById: jest.fn(),
      markProcessing: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
    };

    telegramMessageDispatcherService = {
      dispatch: jest.fn(),
    };

    service = new TelegramMessageProcessingService(
      telegramMessageRepository as any,
      telegramMessageDispatcherService as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip when message does not exist', async () => {
    telegramMessageRepository.findById.mockResolvedValue(null);

    await service.process(createInput());

    expect(telegramMessageRepository.markProcessing).not.toHaveBeenCalled();

    expect(telegramMessageDispatcherService.dispatch).not.toHaveBeenCalled();

    expect(telegramMessageRepository.markProcessed).not.toHaveBeenCalled();
  });

  it('should skip messages that are not RECEIVED', async () => {
    telegramMessageRepository.findById.mockResolvedValue({
      id: createInput().messageId,

      processingStatus: TelegramProcessingStatus.PROCESSED,
    });

    await service.process(createInput());

    expect(telegramMessageRepository.markProcessing).not.toHaveBeenCalled();

    expect(telegramMessageDispatcherService.dispatch).not.toHaveBeenCalled();
  });

  it('should mark message as processing before dispatching', async () => {
    const input = createInput();

    telegramMessageRepository.findById.mockResolvedValue({
      id: input.messageId,

      processingStatus: TelegramProcessingStatus.RECEIVED,
    });

    telegramMessageRepository.markProcessing.mockResolvedValue(undefined);

    telegramMessageDispatcherService.dispatch.mockResolvedValue(undefined);

    telegramMessageRepository.markProcessed.mockResolvedValue(undefined);

    await service.process(input);

    expect(telegramMessageRepository.markProcessing).toHaveBeenCalledWith(
      input.messageId,
    );

    expect(telegramMessageDispatcherService.dispatch).toHaveBeenCalledWith({
      userId: input.userId,

      telegramAccountId: input.telegramAccountId,

      telegramUserId: input.telegramUserId,

      chatId: input.chatId,

      messageId: input.telegramMessageId,

      messageType: input.messageType,

      content: input.content,
    });

    expect(telegramMessageRepository.markProcessed).toHaveBeenCalledWith(
      input.messageId,
    );
  });

  it('should mark message as FAILED when dispatch fails', async () => {
    const input = createInput();

    telegramMessageRepository.findById.mockResolvedValue({
      id: input.messageId,

      processingStatus: TelegramProcessingStatus.RECEIVED,
    });

    telegramMessageDispatcherService.dispatch.mockRejectedValue(
      new Error('Dispatch failed'),
    );

    await expect(service.process(input)).rejects.toThrow('Dispatch failed');

    expect(telegramMessageRepository.markProcessing).toHaveBeenCalledWith(
      input.messageId,
    );

    expect(telegramMessageRepository.markFailed).toHaveBeenCalledWith(
      input.messageId,
    );

    expect(telegramMessageRepository.markProcessed).not.toHaveBeenCalled();
  });

  it('should preserve Telegram identifiers as bigint', async () => {
    const input = createInput();

    telegramMessageRepository.findById.mockResolvedValue({
      id: input.messageId,

      processingStatus: TelegramProcessingStatus.RECEIVED,
    });

    telegramMessageDispatcherService.dispatch.mockResolvedValue(undefined);

    await service.process(input);

    const dispatchedContext =
      telegramMessageDispatcherService.dispatch.mock.calls[0][0];

    expect(typeof dispatchedContext.telegramUserId).toBe('bigint');

    expect(typeof dispatchedContext.chatId).toBe('bigint');

    expect(typeof dispatchedContext.messageId).toBe('bigint');

    expect(dispatchedContext.messageId).toBe(input.telegramMessageId);
  });

  it('should not mark message as processed when dispatch fails', async () => {
    const input = createInput();

    telegramMessageRepository.findById.mockResolvedValue({
      id: input.messageId,

      processingStatus: TelegramProcessingStatus.RECEIVED,
    });

    telegramMessageDispatcherService.dispatch.mockRejectedValue(
      new Error('Dispatch failed'),
    );

    await expect(service.process(input)).rejects.toThrow('Dispatch failed');

    expect(telegramMessageRepository.markProcessed).not.toHaveBeenCalled();
  });
});
