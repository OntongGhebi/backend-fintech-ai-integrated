import { Test, TestingModule } from '@nestjs/testing';

import { TELEGRAM_DETERMINISTIC_TRANSACTION_MESSAGE_PARSER } from '../../telegram.tokens';

import { AITransactionMessageParser } from './ai-transaction-message.parser';
import { TelegramTransactionMessageParser } from './telegram-transaction-message.parser';

describe('TelegramTransactionMessageParser', () => {
  let parser: TelegramTransactionMessageParser;

  const deterministicParser = {
    parse: jest.fn(),
  };

  const aiParser = {
    parse: jest.fn(),
  };

  const input = {
    userId: 'user-id',
    telegramAccountId: 'telegram-account-id',
    telegramUserId: BigInt(123456),
    chatId: BigInt(654321),
    messageId: BigInt(100),
    text: 'tadi makan 35000',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramTransactionMessageParser,
        {
          provide: TELEGRAM_DETERMINISTIC_TRANSACTION_MESSAGE_PARSER,
          useValue: deterministicParser,
        },
        {
          provide: AITransactionMessageParser,
          useValue: aiParser,
        },
      ],
    }).compile();

    parser = module.get<TelegramTransactionMessageParser>(
      TelegramTransactionMessageParser,
    );
  });

  it('should use deterministic parser when it succeeds', async () => {
    const deterministicResult = {
      status: 'PARSED' as const,
      rawText: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION' as const,
        transactionType: 'EXPENSE' as const,
        amount: 35000,
        description: 'tadi makan',
        source: 'DETERMINISTIC' as const,
      },
    };

    deterministicParser.parse.mockResolvedValue(deterministicResult);

    const result = await parser.parse(input);

    expect(result).toEqual(deterministicResult);

    expect(aiParser.parse).not.toHaveBeenCalled();
  });

  it('should use AI when deterministic parser returns unsupported', async () => {
    deterministicParser.parse.mockResolvedValue({
      status: 'UNSUPPORTED',
      rawText: input.text,
    });

    const aiResult = {
      status: 'PARSED' as const,
      rawText: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION' as const,
        transactionType: 'EXPENSE' as const,
        amount: 35000,
        description: 'tadi makan',
        source: 'AI' as const,
        confidence: 0.95,
      },
    };

    aiParser.parse.mockResolvedValue(aiResult);

    const result = await parser.parse(input);

    expect(aiParser.parse).toHaveBeenCalledWith(input);

    expect(result).toEqual(aiResult);
  });

  it('should not use AI when deterministic parser returns invalid', async () => {
    deterministicParser.parse.mockResolvedValue({
      status: 'INVALID',
      rawText: input.text,
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'INVALID',
      rawText: input.text,
    });

    expect(aiParser.parse).not.toHaveBeenCalled();
  });

  it('should return AI unsupported result when both parsers fail', async () => {
    deterministicParser.parse.mockResolvedValue({
      status: 'UNSUPPORTED',
      rawText: input.text,
    });

    aiParser.parse.mockResolvedValue({
      status: 'UNSUPPORTED',
      rawText: input.text,
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: input.text,
    });
  });
});
