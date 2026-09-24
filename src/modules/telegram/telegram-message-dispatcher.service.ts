import { Inject, Injectable, Logger } from '@nestjs/common';

import { TelegramMessageType } from '../../../generated/prisma/enums.js';

import { TelegramCommandParser } from './commands/telegram-command.parser';
import { TelegramCommandRouter } from './commands/telegram-command.router';
import { TelegramCommandContext } from './commands/telegram-command.types';
import { TELEGRAM_TEXT_MESSAGE_HANDLER } from './telegram.tokens';

export interface TelegramMessageDispatchContext {
  userId: string;
  telegramAccountId: string;
  telegramUserId: bigint;
  chatId: bigint;
  messageId: bigint;
  messageType: TelegramMessageType;
  content?: string;
}

export interface TelegramTextMessageHandler {
  handle(context: TelegramMessageDispatchContext): Promise<void>;
}

@Injectable()
export class TelegramMessageDispatcherService {
  private readonly logger = new Logger(TelegramMessageDispatcherService.name);

  constructor(
    private readonly telegramCommandParser: TelegramCommandParser,
    private readonly telegramCommandRouter: TelegramCommandRouter,
    @Inject(TELEGRAM_TEXT_MESSAGE_HANDLER)
    private readonly telegramTextMessageHandler: TelegramTextMessageHandler,
  ) {}

  async dispatch(context: TelegramMessageDispatchContext): Promise<void> {
    switch (context.messageType) {
      case TelegramMessageType.COMMAND:
        await this.dispatchCommand(context);
        return;

      case TelegramMessageType.TEXT:
        await this.dispatchText(context);
        return;

      case TelegramMessageType.CALLBACK:
      case TelegramMessageType.OTHER:
      default:
        this.logger.debug(
          `Ignoring unsupported Telegram message type: ${context.messageType}`,
        );
        return;
    }
  }

  private async dispatchCommand(
    context: TelegramMessageDispatchContext,
  ): Promise<void> {
    const parsedCommand = this.telegramCommandParser.parse(context.content);

    if (!parsedCommand) {
      this.logger.debug(
        `Unable to parse Telegram command: messageId=${context.messageId.toString()}`,
      );

      return;
    }

    const commandContext: TelegramCommandContext = {
      userId: context.userId,
      telegramAccountId: context.telegramAccountId,
      telegramUserId: context.telegramUserId,
      chatId: context.chatId,
      messageId: context.messageId,
      arguments: parsedCommand.arguments,
      rawText: parsedCommand.rawText,
    };

    await this.telegramCommandRouter.route(parsedCommand, commandContext);
  }

  private async dispatchText(
    context: TelegramMessageDispatchContext,
  ): Promise<void> {
    await this.telegramTextMessageHandler.handle(context);
  }
}
