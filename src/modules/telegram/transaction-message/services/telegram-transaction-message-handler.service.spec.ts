import { Test, TestingModule } from '@nestjs/testing';

import { TelegramMessageDispatchContext } from '../../services/telegram-message-dispatcher.service';

import { TelegramTransactionMessageHandlerService } from './telegram-transaction-message-handler.service';
import { TelegramTransactionFlowService } from './telegram-transaction-flow.service';

describe('TelegramTransactionMessageHandlerService', () => {
  let service: TelegramTransactionMessageHandlerService;

  const flowService = {
    handle: jest.fn(),
  };

  const context: TelegramMessageDispatchContext = {
    userId: 'user-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: BigInt(123456),
    chatId: BigInt(654321),
    messageId: BigInt(100),
    messageType: 'TEXT' as TelegramMessageDispatchContext['messageType'],
    content: 'beli makan 25000',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramTransactionMessageHandlerService,
        {
          provide: TelegramTransactionFlowService,
          useValue: flowService,
        },
      ],
    }).compile();

    service = module.get<TelegramTransactionMessageHandlerService>(
      TelegramTransactionMessageHandlerService,
    );
  });

  it('should delegate the Telegram text message to the transaction flow service', async () => {
    flowService.handle.mockResolvedValue(undefined);

    await service.handle(context);

    expect(flowService.handle).toHaveBeenCalledTimes(1);

    expect(flowService.handle).toHaveBeenCalledWith(context);
  });
});
