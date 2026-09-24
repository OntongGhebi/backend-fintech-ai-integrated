import { TelegramCommandRouter } from './telegram-command.router';
import {
  TelegramCommandContext,
  TelegramCommandHandler,
} from './telegram-command.types';

describe('TelegramCommandRouter', () => {
  let router: TelegramCommandRouter;

  const createContext = (): TelegramCommandContext => ({
    userId: '11111111-1111-1111-1111-111111111111',
    telegramAccountId: '22222222-2222-2222-2222-222222222222',
    telegramUserId: BigInt(123456),
    chatId: BigInt(654321),
    messageId: BigInt(1),
    arguments: [],
    rawText: '/start',
  });

  beforeEach(() => {
    router = new TelegramCommandRouter();
  });

  it('should be defined', () => {
    expect(router).toBeDefined();
  });

  it('should register a command handler', () => {
    const handler: TelegramCommandHandler = {
      command: 'start',
      execute: jest.fn().mockResolvedValue(undefined),
    };

    router.register(handler);

    expect(router.has('start')).toBe(true);
  });

  it('should normalize registered command', () => {
    const handler: TelegramCommandHandler = {
      command: 'START',
      execute: jest.fn().mockResolvedValue(undefined),
    };

    router.register(handler);

    expect(router.has('start')).toBe(true);

    expect(router.has('START')).toBe(true);
  });

  it('should reject an empty command', () => {
    const handler: TelegramCommandHandler = {
      command: '   ',
      execute: jest.fn().mockResolvedValue(undefined),
    };

    expect(() => router.register(handler)).toThrow(
      'Telegram command cannot be empty',
    );
  });

  it('should reject duplicate commands', () => {
    const firstHandler: TelegramCommandHandler = {
      command: 'start',
      execute: jest.fn().mockResolvedValue(undefined),
    };

    const secondHandler: TelegramCommandHandler = {
      command: 'START',
      execute: jest.fn().mockResolvedValue(undefined),
    };

    router.register(firstHandler);

    expect(() => router.register(secondHandler)).toThrow(
      'Telegram command "start" is already registered',
    );
  });

  it('should route a command to the registered handler', async () => {
    const executeMock = jest.fn().mockResolvedValue(undefined);

    const handler: TelegramCommandHandler = {
      command: 'start',
      execute: executeMock,
    };

    router.register(handler);

    const parsedCommand = {
      command: 'start',
      arguments: ['hello'],
      rawText: '/start hello',
    };

    const context = createContext();

    const result = await router.route(parsedCommand, context);

    expect(result).toBe(true);

    expect(executeMock).toHaveBeenCalledTimes(1);

    expect(executeMock).toHaveBeenCalledWith({
      ...context,
      arguments: ['hello'],
      rawText: '/start hello',
    });
  });

  it('should return false for an unknown command', async () => {
    const result = await router.route(
      {
        command: 'unknown',
        arguments: [],
        rawText: '/unknown',
      },
      createContext(),
    );

    expect(result).toBe(false);
  });

  it('should propagate handler errors', async () => {
    const executeMock = jest
      .fn()
      .mockRejectedValue(new Error('Command execution failed'));

    const handler: TelegramCommandHandler = {
      command: 'start',
      execute: executeMock,
    };

    router.register(handler);

    await expect(
      router.route(
        {
          command: 'start',
          arguments: [],
          rawText: '/start',
        },
        createContext(),
      ),
    ).rejects.toThrow('Command execution failed');
  });
});
