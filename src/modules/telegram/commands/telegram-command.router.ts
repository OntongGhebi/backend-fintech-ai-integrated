import { Injectable, Logger } from '@nestjs/common';
import {
  ParsedTelegramCommand,
  TelegramCommandContext,
  TelegramCommandHandler,
} from './telegram-command.types';

@Injectable()
export class TelegramCommandRouter {
  private readonly logger = new Logger(TelegramCommandRouter.name);

  private readonly handlers = new Map<string, TelegramCommandHandler>();

  register(handler: TelegramCommandHandler): void {
    const command = handler.command.trim().toLowerCase();

    if (!command) {
      throw new Error('Telegram command cannot be empty');
    }

    if (this.handlers.has(command)) {
      throw new Error(`Telegram command "${command}" is already registered`);
    }

    this.handlers.set(command, handler);
  }

  has(command: string): boolean {
    return this.handlers.has(command.trim().toLowerCase());
  }

  async route(
    parsedCommand: ParsedTelegramCommand,
    context: TelegramCommandContext,
  ): Promise<boolean> {
    const command = parsedCommand.command.trim().toLowerCase();

    const handler = this.handlers.get(command);

    if (!handler) {
      this.logger.debug(`Unknown Telegram command: ${command}`);

      return false;
    }

    await handler.execute({
      ...context,
      arguments: parsedCommand.arguments,
      rawText: parsedCommand.rawText,
    });

    return true;
  }
}
