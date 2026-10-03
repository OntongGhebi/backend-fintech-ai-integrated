import { Test, TestingModule } from '@nestjs/testing';

import { AITransactionIntelligenceService } from '../../../ai/services/ai-transaction-intelligence.service';

import { AITransactionMessageParser } from './ai-transaction-message.parser';

describe('AITransactionMessageParser', () => {
  let parser: AITransactionMessageParser;

  const aiTransactionIntelligenceService = {
    analyze: jest.fn(),
  };

  const input = {
    userId: 'user-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: BigInt(123456),
    chatId: BigInt(654321),
    messageId: BigInt(100),
    text: 'tadi siang aku habis 35000 buat makan',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AITransactionMessageParser,
        {
          provide: AITransactionIntelligenceService,
          useValue: aiTransactionIntelligenceService,
        },
      ],
    }).compile();

    parser = module.get<AITransactionMessageParser>(AITransactionMessageParser);
  });

  it('should parse an AI-supported expense message', async () => {
    aiTransactionIntelligenceService.analyze.mockResolvedValue({
      status: 'READY',
      text: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.96,
      },
      entities: {
        type: 'EXPENSE',
        amount: 35000,
        description: 'tadi siang aku habis buat makan',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        destinationAccountHint: null,
      },
      resolution: {
        account: {
          status: 'RESOLVED',
          hint: 'BCA',
          account: {
            id: 'account-id',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [],
        },
        destinationAccount: {
          status: 'NOT_REQUESTED',
          hint: null,
          account: null,
          candidates: [],
        },
        category: {
          status: 'RESOLVED',
          hint: 'Makanan',
          category: {
            id: 'category-id',
            name: 'Makanan',
            type: 'EXPENSE',
          },
          candidates: [],
        },
        ready: true,
      },
      draft: {
        type: 'EXPENSE',
        amount: 35000,
        description: 'tadi siang aku habis buat makan',
        accountId: 'account-id',
        categoryId: 'category-id',
        destinationAccountId: null,
        currency: 'IDR',
        status: 'READY',
        ready: true,
        unresolvedFields: [],
      },
    });

    const result = await parser.parse(input);

    expect(aiTransactionIntelligenceService.analyze).toHaveBeenCalledWith({
      userId: 'user-id',
      text: input.text,
    });

    expect(result).toEqual({
      status: 'PARSED',
      rawText: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 35000,
        description: 'tadi siang aku habis buat makan',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        transactionDate: undefined,
        confidence: 0.96,
        source: 'AI',
      },
    });
  });

  it('should return unsupported when AI detects a non-transaction intent', async () => {
    aiTransactionIntelligenceService.analyze.mockResolvedValue({
      status: 'UNSUPPORTED',
      text: input.text,
      intent: {
        intent: 'QUERY_BALANCE',
        confidence: 0.95,
      },
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: input.text,
    });
  });

  it('should return invalid when AI intelligence returns incomplete transaction data', async () => {
    aiTransactionIntelligenceService.analyze.mockResolvedValue({
      status: 'READY',
      text: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.9,
      },
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'INVALID',
      rawText: input.text,
    });
  });

  it('should return invalid when AI extracts an invalid amount', async () => {
    aiTransactionIntelligenceService.analyze.mockResolvedValue({
      status: 'READY',
      text: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.9,
      },
      entities: {
        type: 'EXPENSE',
        amount: 0,
        description: 'makan',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        destinationAccountHint: null,
      },
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'INVALID',
      rawText: input.text,
    });
  });

  it('should return invalid when AI does not extract a description', async () => {
    aiTransactionIntelligenceService.analyze.mockResolvedValue({
      status: 'READY',
      text: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.9,
      },
      entities: {
        type: 'EXPENSE',
        amount: 35000,
        description: null,
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        destinationAccountHint: null,
      },
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'INVALID',
      rawText: input.text,
    });
  });

  it('should preserve parsed intent when AI needs additional information', async () => {
    aiTransactionIntelligenceService.analyze.mockResolvedValue({
      status: 'NEEDS_INFORMATION',
      text: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.91,
      },
      entities: {
        type: 'EXPENSE',
        amount: 35000,
        description: 'makan',
        accountHint: null,
        categoryHint: 'Makanan',
        destinationAccountHint: null,
      },
      resolution: {
        account: {
          status: 'NOT_REQUESTED',
          hint: null,
          account: null,
          candidates: [],
        },
        destinationAccount: {
          status: 'NOT_REQUESTED',
          hint: null,
          account: null,
          candidates: [],
        },
        category: {
          status: 'RESOLVED',
          hint: 'Makanan',
          category: {
            id: 'category-id',
            name: 'Makanan',
            type: 'EXPENSE',
          },
          candidates: [],
        },
        ready: false,
      },
      draft: {
        type: 'EXPENSE',
        amount: 35000,
        description: 'makan',
        accountId: null,
        categoryId: 'category-id',
        destinationAccountId: null,
        currency: 'IDR',
        status: 'NEEDS_RESOLUTION',
        ready: false,
        unresolvedFields: ['account'],
      },
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'PARSED',
      rawText: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 35000,
        description: 'makan',
        accountHint: undefined,
        categoryHint: 'Makanan',
        transactionDate: undefined,
        confidence: 0.91,
        source: 'AI',
      },
    });
  });

  it('should return unsupported for transfer until Telegram transfer flow is integrated', async () => {
    aiTransactionIntelligenceService.analyze.mockResolvedValue({
      status: 'READY',
      text: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.97,
      },
      entities: {
        type: 'TRANSFER',
        amount: 100000,
        description: 'transfer ke tabungan',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: 'Jago',
      },
      resolution: {
        account: {
          status: 'RESOLVED',
          hint: 'BCA',
          account: {
            id: 'account-id',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [],
        },
        destinationAccount: {
          status: 'RESOLVED',
          hint: 'Jago',
          account: {
            id: 'destination-account-id',
            name: 'Jago',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [],
        },
        category: {
          status: 'NOT_REQUESTED',
          hint: null,
          category: null,
          candidates: [],
        },
        ready: true,
      },
      draft: {
        type: 'TRANSFER',
        amount: 100000,
        description: 'transfer ke tabungan',
        accountId: 'account-id',
        categoryId: null,
        destinationAccountId: 'destination-account-id',
        currency: 'IDR',
        status: 'READY',
        ready: true,
        unresolvedFields: [],
      },
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: input.text,
    });
  });

  it('should return unsupported when AI intelligence fails', async () => {
    aiTransactionIntelligenceService.analyze.mockRejectedValue(
      new Error('AI unavailable'),
    );

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: input.text,
    });
  });
});
