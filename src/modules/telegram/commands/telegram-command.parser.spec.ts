import { TelegramCommandParser } from './telegram-command.parser';

describe('TelegramCommandParser', () => {
  let parser: TelegramCommandParser;

  beforeEach(() => {
    parser = new TelegramCommandParser();
  });

  it('should be defined', () => {
    expect(parser).toBeDefined();
  });

  it('should parse a simple command', () => {
    const result = parser.parse('/start');

    expect(result).toEqual({
      command: 'start',
      arguments: [],
      rawText: '/start',
    });
  });

  it('should parse command arguments', () => {
    const result = parser.parse('/help account');

    expect(result).toEqual({
      command: 'help',
      arguments: ['account'],
      rawText: '/help account',
    });
  });

  it('should normalize command to lowercase', () => {
    const result = parser.parse('/START');

    expect(result).toEqual({
      command: 'start',
      arguments: [],
      rawText: '/START',
    });
  });

  it('should support Telegram bot username suffix', () => {
    const result = parser.parse('/balance@FinanceBot');

    expect(result).toEqual({
      command: 'balance',
      arguments: [],
      rawText: '/balance@FinanceBot',
    });
  });

  it('should parse arguments with bot username suffix', () => {
    const result = parser.parse('/account@FinanceBot bca utama');

    expect(result).toEqual({
      command: 'account',
      arguments: ['bca', 'utama'],
      rawText: '/account@FinanceBot bca utama',
    });
  });

  it('should trim surrounding whitespace', () => {
    const result = parser.parse('   /start   ');

    expect(result).toEqual({
      command: 'start',
      arguments: [],
      rawText: '   /start   ',
    });
  });

  it('should return null for normal text', () => {
    const result = parser.parse('makan siang 25000');

    expect(result).toBeNull();
  });

  it('should return null for empty text', () => {
    expect(parser.parse('')).toBeNull();

    expect(parser.parse(undefined)).toBeNull();
  });

  it('should return null for slash without command', () => {
    const result = parser.parse('/');

    expect(result).toBeNull();
  });

  it('should ignore extra whitespace between arguments', () => {
    const result = parser.parse('/account   bca    utama');

    expect(result).toEqual({
      command: 'account',
      arguments: ['bca', 'utama'],
      rawText: '/account   bca    utama',
    });
  });
});
