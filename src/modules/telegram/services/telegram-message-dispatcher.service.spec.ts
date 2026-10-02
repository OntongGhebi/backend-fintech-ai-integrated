import { TelegramMessageType } from '../../../../generated/prisma/enums.js';

import { TelegramCommandParser } from '../commands/telegram-command.parser.js';
import { TelegramCommandRouter } from '../commands/telegram-command.router.js';
import { TelegramCommandContext } from '../commands/telegram-command.types.js';
import {
  TelegramMessageDispatcherService,
  TelegramMessageDispatchContext,
  TelegramTextMessageHandler,
} from './telegram-message-dispatcher.service';

describe('TelegramMessageDispatcherService', () => {
  let dispatcher: TelegramMessageDispatcherService;

  let commandParser: {
    parse: jest.Mock;
  };

  let commandRouter: {
    route: jest.Mock;
  };

  let textHandler: TelegramTextMessageHandler;

  const createContext = (
    overrides: Partial<TelegramMessageDispatchContext> = {},
  ): TelegramMessageDispatchContext => ({
    userId: '11111111-1111-1111-1111-111111111111',
    telegramAccountId: '22222222-2222-2222-2222-222222222222',
    telegramUserId: BigInt(123456),
    chatId: BigInt(654321),
    messageId: BigInt(100),
    messageType: TelegramMessageType.TEXT,
    content: 'makan siang 25000',
    ...overrides,
  });

  beforeEach(() => {
    commandParser = {
      parse: jest.fn(),
    };

    commandRouter = {
      route: jest.fn().mockResolvedValue(true),
    };

    textHandler = {
      handle: jest.fn().mockResolvedValue(undefined),
    };

    dispatcher = new TelegramMessageDispatcherService(
      commandParser as unknown as TelegramCommandParser,
      commandRouter as unknown as TelegramCommandRouter,
      textHandler,
    );
  });

  it('should be defined', () => {
    expect(dispatcher).toBeDefined();
  });

  it('should dispatch text messages to the text handler', async () => {
    const context = createContext({
      messageType: TelegramMessageType.TEXT,
      content: 'makan siang 25000',
    });

    await dispatcher.dispatch(context);

    expect(textHandler.handle).toHaveBeenCalledTimes(1);

    expect(textHandler.handle).toHaveBeenCalledWith(context);

    expect(commandParser.parse).not.toHaveBeenCalled();
    expect(commandRouter.route).not.toHaveBeenCalled();
  });

  it('should parse and route command messages', async () => {
    const parsedCommand = {
      command: 'start',
      arguments: ['hello'],
      rawText: '/start hello',
    };

    commandParser.parse.mockReturnValue(parsedCommand);

    const context = createContext({
      messageType: TelegramMessageType.COMMAND,
      content: '/start hello',
    });

    await dispatcher.dispatch(context);

    expect(commandParser.parse).toHaveBeenCalledWith('/start hello');

    expect(commandRouter.route).toHaveBeenCalledTimes(1);

    const expectedContext: TelegramCommandContext = {
      userId: context.userId,
      telegramAccountId: context.telegramAccountId,
      telegramUserId: context.telegramUserId,
      chatId: context.chatId,
      messageId: context.messageId,
      arguments: ['hello'],
      rawText: '/start hello',
    };

    expect(commandRouter.route).toHaveBeenCalledWith(
      parsedCommand,
      expectedContext,
    );

    expect(textHandler.handle).not.toHaveBeenCalled();
  });

  it('should ignore command messages when command parsing fails', async () => {
    commandParser.parse.mockReturnValue(null);

    const context = createContext({
      messageType: TelegramMessageType.COMMAND,
      content: '/',
    });

    await dispatcher.dispatch(context);

    expect(commandParser.parse).toHaveBeenCalledWith('/');

    expect(commandRouter.route).not.toHaveBeenCalled();
    expect(textHandler.handle).not.toHaveBeenCalled();
  });

  it('should ignore callback messages', async () => {
    const context = createContext({
      messageType: TelegramMessageType.CALLBACK,
    });

    await dispatcher.dispatch(context);

    expect(commandParser.parse).not.toHaveBeenCalled();
    expect(commandRouter.route).not.toHaveBeenCalled();
    expect(textHandler.handle).not.toHaveBeenCalled();
  });

  it('should ignore unsupported messages', async () => {
    const context = createContext({
      messageType: TelegramMessageType.OTHER,
    });

    await dispatcher.dispatch(context);

    expect(commandParser.parse).not.toHaveBeenCalled();
    expect(commandRouter.route).not.toHaveBeenCalled();
    expect(textHandler.handle).not.toHaveBeenCalled();
  });

  it('should propagate command handler errors', async () => {
    const parsedCommand = {
      command: 'start',
      arguments: [],
      rawText: '/start',
    };

    commandParser.parse.mockReturnValue(parsedCommand);

    commandRouter.route.mockRejectedValue(
      new Error('Command execution failed'),
    );

    const context = createContext({
      messageType: TelegramMessageType.COMMAND,
      content: '/start',
    });

    await expect(dispatcher.dispatch(context)).rejects.toThrow(
      'Command execution failed',
    );
  });

  it('should propagate text handler errors', async () => {
    (textHandler.handle as jest.Mock).mockRejectedValue(
      new Error('Text processing failed'),
    );

    const context = createContext({
      messageType: TelegramMessageType.TEXT,
    });

    await expect(dispatcher.dispatch(context)).rejects.toThrow(
      'Text processing failed',
    );
  });
});
