import { TelegramTransactionMessageHandlerService } from './telegram-transaction-message-handler.service';

import { TelegramMessageDispatchContext } from '../telegram-message-dispatcher.service';

import { TransactionMessagePipelineService } from './transaction-message-pipeline.service';

describe('TelegramTransactionMessageHandlerService', () => {
  let service: TelegramTransactionMessageHandlerService;

  let pipelineService: {
    process: jest.Mock;
  };

  const createContext = (
    overrides: Partial<TelegramMessageDispatchContext> = {},
  ): TelegramMessageDispatchContext => ({
    userId: '11111111-1111-1111-1111-111111111111',

    telegramAccountId: '22222222-2222-2222-2222-222222222222',

    telegramUserId: BigInt(123456),

    chatId: BigInt(654321),

    messageId: BigInt(100),

    messageType: 'TEXT' as TelegramMessageDispatchContext['messageType'],

    content: 'makan siang 25000',

    ...overrides,
  });

  beforeEach(() => {
    pipelineService = {
      process: jest.fn(),
    };

    service = new TelegramTransactionMessageHandlerService(
      pipelineService as unknown as TransactionMessagePipelineService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should convert dispatcher context into transaction message input', async () => {
    const context = createContext();

    pipelineService.process.mockResolvedValue({
      status: 'PARSED',
      rawText: context.content,
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
        description: 'makan siang',
        source: 'DETERMINISTIC',
        confidence: 1,
      },
    });

    await service.handle(context);

    expect(pipelineService.process).toHaveBeenCalledTimes(1);

    expect(pipelineService.process).toHaveBeenCalledWith({
      userId: context.userId,
      telegramAccountId: context.telegramAccountId,
      telegramUserId: context.telegramUserId,
      chatId: context.chatId,
      messageId: context.messageId,
      text: context.content,
    });
  });

  it('should use an empty string when content is undefined', async () => {
    const context = createContext({
      content: undefined,
    });

    pipelineService.process.mockResolvedValue({
      status: 'INVALID',
      rawText: '',
    });

    await service.handle(context);

    expect(pipelineService.process).toHaveBeenCalledWith({
      userId: context.userId,
      telegramAccountId: context.telegramAccountId,
      telegramUserId: context.telegramUserId,
      chatId: context.chatId,
      messageId: context.messageId,
      text: '',
    });
  });

  it('should propagate pipeline errors', async () => {
    const context = createContext();

    pipelineService.process.mockRejectedValue(new Error('Pipeline failed'));

    await expect(service.handle(context)).rejects.toThrow('Pipeline failed');

    expect(pipelineService.process).toHaveBeenCalledTimes(1);
  });
});
