import { Test, TestingModule } from '@nestjs/testing';

import { TelegramMessageDispatchContext } from '../telegram-message-dispatcher.service';
import { TelegramService } from '../telegram.service';

import { TelegramTransactionFlowService } from './telegram-transaction-flow.service';
import { TransactionIntentResolutionService } from './transaction-intent-resolution.service';
import { TransactionConfirmationService } from './transaction-confirmation.service';
import { TransactionConfirmationMessageService } from './transaction-confirmation-message.service';
import { TelegramTransactionConfirmationService } from './telegram-transaction-confirmation.service';
import { TransactionMessagePipelineService } from './transaction-message-pipeline.service';

describe('TelegramTransactionFlowService', () => {
  let service: TelegramTransactionFlowService;

  const pipelineService = {
    process: jest.fn(),
  };

  const resolutionService = {
    resolve: jest.fn(),
  };

  const confirmationService = {
    create: jest.fn(),
  };

  const confirmationMessageService = {
    format: jest.fn(),
  };

  const transactionConfirmationService = {
    handle: jest.fn(),
  };

  const telegramService = {
    sendMessage: jest.fn(),
  };

  const context: TelegramMessageDispatchContext = {
    userId: 'user-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: BigInt(123456),
    chatId: BigInt(654321),
    messageId: BigInt(100),
    messageType: 'TEXT' as TelegramMessageDispatchContext['messageType'],
    content: 'beli makan 25000 dari BCA',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramTransactionFlowService,
        {
          provide: TransactionMessagePipelineService,
          useValue: pipelineService,
        },
        {
          provide: TransactionIntentResolutionService,
          useValue: resolutionService,
        },
        {
          provide: TransactionConfirmationService,
          useValue: confirmationService,
        },
        {
          provide: TransactionConfirmationMessageService,
          useValue: confirmationMessageService,
        },
        {
          provide: TelegramTransactionConfirmationService,
          useValue: transactionConfirmationService,
        },
        {
          provide: TelegramService,
          useValue: telegramService,
        },
      ],
    }).compile();

    service = module.get<TelegramTransactionFlowService>(
      TelegramTransactionFlowService,
    );

    telegramService.sendMessage.mockResolvedValue({
      messageId: BigInt(200),
    });
  });

  it('should process a confirmation reply before parsing a new transaction', async () => {
    transactionConfirmationService.handle.mockResolvedValue({
      handled: true,
      action: 'CONFIRM',
      status: 'COMPLETED',
      message: 'TRANSACTION_CREATED',
      transactionId: 'transaction-id',
    });

    await service.handle({
      ...context,
      content: 'YA',
    });

    expect(transactionConfirmationService.handle).toHaveBeenCalledWith({
      userId: 'user-id',
      chatId: '654321',
      sourceMessageId: '100',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: BigInt(123456),
      text: 'YA',
    });

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: '654321',
      text: 'TRANSACTION_CREATED',
    });

    expect(pipelineService.process).not.toHaveBeenCalled();
  });

  it('should not parse a new transaction when confirmation is handled', async () => {
    transactionConfirmationService.handle.mockResolvedValue({
      handled: true,
      action: 'CANCEL',
      status: 'CANCELLED',
      message: 'CANCELLED',
    });

    await service.handle({
      ...context,
      content: 'BATAL',
    });

    expect(transactionConfirmationService.handle).toHaveBeenCalled();

    expect(pipelineService.process).not.toHaveBeenCalled();

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: '654321',
      text: 'CANCELLED',
    });
  });

  it('should parse a new transaction when no confirmation is handled', async () => {
    transactionConfirmationService.handle.mockResolvedValue({
      handled: false,
      action: 'NONE',
      status: 'NONE',
      message: 'NO_PENDING',
    });

    pipelineService.process.mockResolvedValue({
      status: 'PARSED',
      rawText: 'beli makan 25000 dari BCA',
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
        description: 'beli makan dari BCA',
        accountHint: 'BCA',
        source: 'DETERMINISTIC',
        confidence: 1,
      },
    });

    resolutionService.resolve.mockResolvedValue({
      status: 'RESOLVED',
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
        description: 'beli makan dari BCA',
        accountId: 'account-id',
        source: 'DETERMINISTIC',
        confidence: 1,
        originalIntent: {
          intent: 'CREATE_TRANSACTION',
          transactionType: 'EXPENSE',
          amount: 25000,
          description: 'beli makan dari BCA',
          accountHint: 'BCA',
          source: 'DETERMINISTIC',
          confidence: 1,
        },
      },
    });

    const confirmation = {
      id: 'confirmation-id',
      userId: 'user-id',
      chatId: '654321',
      sourceMessageId: '100',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: BigInt(123456),
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
        description: 'beli makan dari BCA',
        accountId: 'account-id',
        source: 'DETERMINISTIC',
        confidence: 1,
        originalIntent: {
          intent: 'CREATE_TRANSACTION',
          transactionType: 'EXPENSE',
          amount: 25000,
          description: 'beli makan dari BCA',
          accountHint: 'BCA',
          source: 'DETERMINISTIC',
          confidence: 1,
        },
      },
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };

    confirmationService.create.mockReturnValue(confirmation);

    confirmationMessageService.format.mockReturnValue('CONFIRMATION_MESSAGE');

    await service.handle(context);

    expect(pipelineService.process).toHaveBeenCalledWith({
      userId: 'user-id',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: BigInt(123456),
      chatId: BigInt(654321),
      messageId: BigInt(100),
      text: 'beli makan 25000 dari BCA',
    });

    expect(resolutionService.resolve).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
      }),
    );

    expect(confirmationService.create).toHaveBeenCalledWith({
      userId: 'user-id',
      chatId: '654321',
      sourceMessageId: '100',
      telegramAccountId: 'telegram-account-id',
      telegramUserId: BigInt(123456),
      intent: expect.objectContaining({
        accountId: 'account-id',
      }),
    });

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: '654321',
      text: 'CONFIRMATION_MESSAGE',
    });
  });

  it('should request account when account cannot be resolved', async () => {
    transactionConfirmationService.handle.mockResolvedValue({
      handled: false,
      action: 'NONE',
      status: 'NONE',
      message: 'NO_PENDING',
    });

    pipelineService.process.mockResolvedValue({
      status: 'PARSED',
      rawText: 'beli makan 25000',
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
        description: 'beli makan',
        source: 'DETERMINISTIC',
        confidence: 1,
      },
    });

    resolutionService.resolve.mockResolvedValue({
      status: 'NEEDS_ACCOUNT',
    });

    await service.handle({
      ...context,
      content: 'beli makan 25000',
    });

    expect(confirmationService.create).not.toHaveBeenCalled();

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: '654321',
      text: expect.stringContaining('Account belum ditentukan'),
    });
  });

  it('should request category when category is required', async () => {
    transactionConfirmationService.handle.mockResolvedValue({
      handled: false,
      action: 'NONE',
      status: 'NONE',
      message: 'NO_PENDING',
    });

    pipelineService.process.mockResolvedValue({
      status: 'PARSED',
      rawText: 'beli makan 25000 dari BCA',
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
        description: 'beli makan dari BCA',
        accountHint: 'BCA',
        source: 'DETERMINISTIC',
        confidence: 1,
      },
    });

    resolutionService.resolve.mockResolvedValue({
      status: 'NEEDS_CATEGORY',
    });

    await service.handle(context);

    expect(confirmationService.create).not.toHaveBeenCalled();

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: '654321',
      text: expect.stringContaining('Category belum ditentukan'),
    });
  });

  it('should ignore unsupported transaction messages', async () => {
    transactionConfirmationService.handle.mockResolvedValue({
      handled: false,
      action: 'NONE',
      status: 'NONE',
      message: 'NO_PENDING',
    });

    pipelineService.process.mockResolvedValue({
      status: 'UNSUPPORTED',
      rawText: 'halo bot',
    });

    await service.handle({
      ...context,
      content: 'halo bot',
    });

    expect(resolutionService.resolve).not.toHaveBeenCalled();

    expect(confirmationService.create).not.toHaveBeenCalled();

    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });
});
