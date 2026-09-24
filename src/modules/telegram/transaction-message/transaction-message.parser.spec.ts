import { BasicTransactionMessageParser } from './transaction-message.parser';
import {
  TransactionMessageInput,
  TransactionMessageParser,
} from './transaction-message.types';

describe('BasicTransactionMessageParser', () => {
  let parser: TransactionMessageParser;

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
    parser = new BasicTransactionMessageParser();
  });

  it('should be defined', () => {
    expect(parser).toBeDefined();
  });

  it('should implement the transaction message parser contract', () => {
    expect(typeof parser.parse).toBe('function');
  });

  it('should return unsupported for non-empty text', async () => {
    const input = createInput();

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: 'makan siang 25000',
    });
  });

  it('should return invalid for empty text', async () => {
    const input = createInput({
      text: '',
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'INVALID',
      rawText: '',
    });
  });

  it('should return invalid for whitespace-only text', async () => {
    const input = createInput({
      text: '   ',
    });

    const result = await parser.parse(input);

    expect(result).toEqual({
      status: 'INVALID',
      rawText: '   ',
    });
  });

  it('should preserve the original raw text', async () => {
    const input = createInput({
      text: '  makan siang 25000  ',
    });

    const result = await parser.parse(input);

    expect(result.rawText).toBe('  makan siang 25000  ');
  });
});
