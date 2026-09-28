import { Test, TestingModule } from '@nestjs/testing';

import { TelegramMessageDispatchContext } from '../telegram-message-dispatcher.service';
import { TelegramService } from '../telegram.service';

import { TransactionConfirmationMessageService } from './transaction-confirmation-message.service';
import { TransactionConfirmationService } from './transaction-confirmation.service';
import { TransactionIntentResolutionService } from './transaction-intent-resolution.service';
import { TransactionMessagePipelineService } from './transaction-message-pipeline.service';
import { TelegramTransactionConfirmationService } from './telegram-transaction-confirmation.service';
import { TelegramTransactionFlowErrorService } from '../services/transaction/telegram-transaction-flow-error.service';
import { TelegramTransactionFlowService } from './telegram-transaction-flow.service';

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

  const flowErrorService = {
    handle: jest.fn(),
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
        {
          provide: TelegramTransactionFlowErrorService,
          useValue: flowErrorService,
        },
      ],
    }).compile();

    service = module.get<TelegramTransactionFlowService>(
      TelegramTransactionFlowService,
    );

    telegramService.sendMessage.mockResolvedValue({
      messageId: BigInt(200),
    });

    flowErrorService.handle.mockReturnValue(
      [
        '⚠️ Transaksi belum dapat diproses.',
        '',
        'Terjadi kesalahan saat memproses transaksi Anda.',
        'Silakan coba lagi.',
      ].join('\n'),
    );
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

  it('should handle unexpected pipeline errors safely', async () => {
    transactionConfirmationService.handle.mockResolvedValue({
      handled: false,
      action: 'NONE',
      status: 'NONE',
      message: 'NO_PENDING',
    });

    const error = new Error('database connection failed');

    pipelineService.process.mockRejectedValue(error);

    await service.handle(context);

    expect(flowErrorService.handle).toHaveBeenCalledWith(error);

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: '654321',
      text: [
        '⚠️ Transaksi belum dapat diproses.',
        '',
        'Terjadi kesalahan saat memproses transaksi Anda.',
        'Silakan coba lagi.',
      ].join('\n'),
    });
  });

  it('should handle unexpected resolution errors safely', async () => {
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

    const error = new Error('category repository unavailable');

    resolutionService.resolve.mockRejectedValue(error);

    await service.handle(context);

    expect(flowErrorService.handle).toHaveBeenCalledWith(error);

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: '654321',
      text: expect.stringContaining('Transaksi belum dapat diproses'),
    });
  });

  it('should handle unexpected confirmation creation errors safely', async () => {
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

    const error = new Error('confirmation storage failed');

    confirmationService.create.mockImplementation(() => {
      throw error;
    });

    await service.handle(context);

    expect(flowErrorService.handle).toHaveBeenCalledWith(error);

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: '654321',
      text: expect.stringContaining('Transaksi belum dapat diproses'),
    });
  });

  it('should not expose internal error details to the user', async () => {
    transactionConfirmationService.handle.mockResolvedValue({
      handled: false,
      action: 'NONE',
      status: 'NONE',
      message: 'NO_PENDING',
    });

    const error = new Error('PrismaClientKnownRequestError: password=secret');

    pipelineService.process.mockRejectedValue(error);

    await service.handle(context);

    const [sentMessage] = telegramService.sendMessage.mock.calls[0];

    expect(sentMessage.text).not.toContain('PrismaClient');

    expect(sentMessage.text).not.toContain('password');

    expect(sentMessage.text).not.toContain('secret');
  });

  it('should not throw when sending the fallback error response fails', async () => {
    transactionConfirmationService.handle.mockResolvedValue({
      handled: false,
      action: 'NONE',
      status: 'NONE',
      message: 'NO_PENDING',
    });

    const processingError = new Error('pipeline failed');

    const sendError = new Error('telegram unavailable');

    pipelineService.process.mockRejectedValue(processingError);

    telegramService.sendMessage.mockRejectedValueOnce(sendError);

    await expect(service.handle(context)).resolves.toBeUndefined();

    expect(flowErrorService.handle).toHaveBeenCalledWith(processingError);
  });
});
