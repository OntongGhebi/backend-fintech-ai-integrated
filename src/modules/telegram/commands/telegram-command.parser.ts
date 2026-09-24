import { Injectable } from '@nestjs/common';
import { ParsedTelegramCommand } from './telegram-command.types';

@Injectable()
export class TelegramCommandParser {
  parse(text: string | undefined): ParsedTelegramCommand | null {
    if (!text?.trim()) {
      return null;
    }

    const normalizedText = text.trim();

    if (!normalizedText.startsWith('/')) {
      return null;
    }

    const tokens = normalizedText.split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
      return null;
    }

    const commandToken = tokens[0];
    const commandWithoutSlash = commandToken.slice(1);

    if (!commandWithoutSlash) {
      return null;
    }

    const commandParts = commandWithoutSlash.split('@');
    const command = commandParts[0].toLowerCase();

    if (!command) {
      return null;
    }

    return {
      command,
      arguments: tokens.slice(1),
      rawText: text,
    };
  }
}
