import { Test, TestingModule } from '@nestjs/testing';

import { AITransactionIntelligenceService } from '../../../ai/services/ai-transaction-intelligence.service';

import { AITransactionMessageParser } from './ai-transaction-message.parser';

describe('AITransactionMessageParser', () => {
  let parser: AITransactionMessageParser;

  const intelligenceService = {
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
          useValue: intelligenceService,
        },
      ],
    }).compile();

    parser = module.get<AITransactionMessageParser>(AITransactionMessageParser);
  });

  it('should return invalid for empty text', async () => {
    const result = await parser.parse({
      ...input,
      text: '   ',
    });

    expect(result).toEqual({
      status: 'INVALID',
      rawText: '   ',
    });

    expect(intelligenceService.analyze).not.toHaveBeenCalled();
  });

  it('should parse an AI-supported expense message', async () => {
    intelligenceService.analyze.mockResolvedValue({
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

    expect(intelligenceService.analyze).toHaveBeenCalledWith({
      userId: input.userId,
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
        categoryHint: 'Makanan',
        accountHint: 'BCA',
        transactionDate: undefined,
        confidence: 0.96,
        source: 'AI',
      },
    });
  });

  it('should return unsupported for non-transaction intent', async () => {
    intelligenceService.analyze.mockResolvedValue({
      status: 'UNSUPPORTED',
      text: 'halo',
      intent: {
        intent: 'GENERAL_CHAT',
        confidence: 0.95,
      },
    });

    const result = await parser.parse({
      ...input,
      text: 'halo',
    });

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: 'halo',
    });
  });

  it('should reject an AI validation failure', async () => {
    intelligenceService.analyze.mockResolvedValue({
      status: 'INVALID',
      text: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.52,
      },
      validationReason:
        'AI intent confidence is below the minimum threshold of 0.8',
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'INVALID',
      rawText: input.text,
    });
  });

  it('should reject invalid amount returned by AI', async () => {
    intelligenceService.analyze.mockResolvedValue({
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

  it('should reject when AI does not extract a description', async () => {
    intelligenceService.analyze.mockResolvedValue({
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

  it('should preserve AI timeout errors', async () => {
    intelligenceService.analyze.mockResolvedValue({
      status: 'ERROR',
      text: input.text,
      errorCode: 'AI_TIMEOUT',
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'ERROR',
      rawText: input.text,
      errorCode: 'AI_TIMEOUT',
    });
  });

  it('should preserve AI unavailable errors', async () => {
    intelligenceService.analyze.mockResolvedValue({
      status: 'ERROR',
      text: input.text,
      errorCode: 'AI_UNAVAILABLE',
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'ERROR',
      rawText: input.text,
      errorCode: 'AI_UNAVAILABLE',
    });
  });

  it('should preserve AI provider errors', async () => {
    intelligenceService.analyze.mockResolvedValue({
      status: 'ERROR',
      text: input.text,
      errorCode: 'AI_PROVIDER_ERROR',
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'ERROR',
      rawText: input.text,
      errorCode: 'AI_PROVIDER_ERROR',
    });
  });

  it('should return unsupported for transfer until the Telegram transfer adapter is integrated', async () => {
    intelligenceService.analyze.mockResolvedValue({
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
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: input.text,
    });
  });
});
