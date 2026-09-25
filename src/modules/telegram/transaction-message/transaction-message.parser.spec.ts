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

  it('should parse an expense transaction', async () => {
    const result = await parser.parse(
      createInput({
        text: 'makan siang 25000',
      }),
    );

    expect(result).toEqual({
      status: 'PARSED',
      rawText: 'makan siang 25000',
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'EXPENSE',
        amount: 25000,
        description: 'makan siang',
        source: 'DETERMINISTIC',
        confidence: 1,
      },
    });
  });

  it('should parse an income transaction', async () => {
    const result = await parser.parse(
      createInput({
        text: 'gaji 5000000',
      }),
    );

    expect(result).toEqual({
      status: 'PARSED',
      rawText: 'gaji 5000000',
      intent: {
        intent: 'CREATE_TRANSACTION',
        transactionType: 'INCOME',
        amount: 5000000,
        description: 'gaji',
        source: 'DETERMINISTIC',
        confidence: 1,
      },
    });
  });

  it('should parse thousands separator using dot', async () => {
    const result = await parser.parse(
      createInput({
        text: 'belanja 25.000',
      }),
    );

    expect(result.intent?.amount).toBe(25000);

    expect(result.intent?.description).toBe('belanja');
  });

  it('should parse rupiah prefix', async () => {
    const result = await parser.parse(
      createInput({
        text: 'makan Rp25.000',
      }),
    );

    expect(result.intent?.amount).toBe(25000);

    expect(result.intent?.description).toBe('makan');
  });

  it('should parse IDR prefix', async () => {
    const result = await parser.parse(
      createInput({
        text: 'gaji IDR 5.000.000',
      }),
    );

    expect(result.intent?.amount).toBe(5000000);

    expect(result.intent?.description).toBe('gaji');
  });

  it('should use the last numeric value as amount', async () => {
    const result = await parser.parse(
      createInput({
        text: 'beli 2 kopi 30000',
      }),
    );

    expect(result.status).toBe('PARSED');

    expect(result.intent?.amount).toBe(30000);

    expect(result.intent?.description).toBe('beli 2 kopi');
  });

  it('should preserve numeric values that are part of the description', async () => {
    const result = await parser.parse(
      createInput({
        text: 'beli 2 roti 30000',
      }),
    );

    expect(result.status).toBe('PARSED');

    expect(result.intent?.amount).toBe(30000);

    expect(result.intent?.description).toBe('beli 2 roti');
  });

  it('should normalize surrounding whitespace', async () => {
    const result = await parser.parse(
      createInput({
        text: '   makan siang 25000   ',
      }),
    );

    expect(result.status).toBe('PARSED');

    expect(result.rawText).toBe('   makan siang 25000   ');

    expect(result.intent?.description).toBe('makan siang');
  });

  it('should return unsupported when amount is missing', async () => {
    const result = await parser.parse(
      createInput({
        text: 'makan siang',
      }),
    );

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: 'makan siang',
    });
  });

  it('should return unsupported when transaction type cannot be detected', async () => {
    const result = await parser.parse(
      createInput({
        text: 'catatan 25000',
      }),
    );

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: 'catatan 25000',
    });
  });

  it('should return invalid for empty text', async () => {
    const result = await parser.parse(
      createInput({
        text: '',
      }),
    );

    expect(result).toEqual({
      status: 'INVALID',
      rawText: '',
    });
  });

  it('should return invalid for whitespace-only text', async () => {
    const result = await parser.parse(
      createInput({
        text: '   ',
      }),
    );

    expect(result).toEqual({
      status: 'INVALID',
      rawText: '   ',
    });
  });

  it('should preserve raw text', async () => {
    const input = createInput({
      text: '  makan 25000  ',
    });

    const result = await parser.parse(input);

    expect(result.rawText).toBe('  makan 25000  ');
  });

  it('should parse income keyword "bonus"', async () => {
    const result = await parser.parse(
      createInput({
        text: 'bonus kantor 1500000',
      }),
    );

    expect(result.intent?.transactionType).toBe('INCOME');

    expect(result.intent?.amount).toBe(1500000);
  });

  it('should parse expense keyword "bayar"', async () => {
    const result = await parser.parse(
      createInput({
        text: 'bayar listrik 150000',
      }),
    );

    expect(result.intent?.transactionType).toBe('EXPENSE');

    expect(result.intent?.amount).toBe(150000);
  });

  it('should reject zero amount', async () => {
    const result = await parser.parse(
      createInput({
        text: 'makan 0',
      }),
    );

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      rawText: 'makan 0',
    });
  });
});
