import { TransactionMessagePipelineService } from './transaction-message-pipeline.service';

import {
  ParsedTransactionMessage,
  TransactionMessageInput,
  TransactionMessageParser,
} from '../types/transaction-message.types';

describe('TransactionMessagePipelineService', () => {
  let service: TransactionMessagePipelineService;

  let parser: {
    parse: jest.Mock;
  };

  const createInput = (
    overrides: Partial<TransactionMessageInput> = {},
  ): TransactionMessageInput => ({
    userId: '11111111-1111-1111-1111-111111111111',

    telegramAccountId: '22222222-2222-2222-2222-222222222222',

    telegramUserId: BigInt(123456),

    chatId: BigInt(654321),

    messageId: BigInt(100),

    text: 'makan siang 25000',

    ...overrides,
  });

  beforeEach(() => {
    parser = {
      parse: jest.fn(),
    };

    service = new TransactionMessagePipelineService(
      parser as unknown as TransactionMessageParser,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call the parser with the original input', async () => {
    const input = createInput();

    const parsedResult: ParsedTransactionMessage = {
      status: 'PARSED',
      rawText: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
        description: 'makan siang',
        source: 'DETERMINISTIC',
        confidence: 1,
      },
    };

    parser.parse.mockResolvedValue(parsedResult);

    const result = await service.process(input);

    expect(parser.parse).toHaveBeenCalledTimes(1);

    expect(parser.parse).toHaveBeenCalledWith(input);

    expect(result).toEqual(parsedResult);
  });

  it('should return parsed transaction intent', async () => {
    const input = createInput();

    const parsedResult: ParsedTransactionMessage = {
      status: 'PARSED',
      rawText: input.text,
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
        description: 'makan siang',
        source: 'DETERMINISTIC',
        confidence: 1,
      },
    };

    parser.parse.mockResolvedValue(parsedResult);

    const result = await service.process(input);

    expect(result.status).toBe('PARSED');

    expect(result.intent).toEqual(parsedResult.intent);
  });

  it('should return unsupported result without modification', async () => {
    const input = createInput({
      text: 'halo',
    });

    const parsedResult: ParsedTransactionMessage = {
      status: 'UNSUPPORTED',
      rawText: 'halo',
    };

    parser.parse.mockResolvedValue(parsedResult);

    const result = await service.process(input);

    expect(result).toEqual(parsedResult);

    expect(result.intent).toBeUndefined();
  });

  it('should return invalid result without modification', async () => {
    const input = createInput({
      text: '',
    });

    const parsedResult: ParsedTransactionMessage = {
      status: 'INVALID',
      rawText: '',
    };

    parser.parse.mockResolvedValue(parsedResult);

    const result = await service.process(input);

    expect(result).toEqual(parsedResult);
  });

  it('should propagate parser errors', async () => {
    const input = createInput();

    parser.parse.mockRejectedValue(new Error('Transaction parser failed'));

    await expect(service.process(input)).rejects.toThrow(
      'Transaction parser failed',
    );

    expect(parser.parse).toHaveBeenCalledWith(input);
  });
});
