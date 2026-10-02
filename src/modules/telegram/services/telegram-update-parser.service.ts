import { Injectable } from '@nestjs/common';
import {
  TelegramMessageDto,
  TelegramUpdateDto,
} from '../dto/telegram-update.dto';
import { ParsedTelegramMessage } from '../types/telegram-parser.types';

@Injectable()
export class TelegramUpdateParserService {
  parse(update: TelegramUpdateDto): ParsedTelegramMessage | null {
    if (!update.message) {
      return null;
    }

    return this.parseMessage(update.update_id, update.message);
  }

  private parseMessage(
    updateId: number,
    message: TelegramMessageDto,
  ): ParsedTelegramMessage | null {
    if (!message.text?.trim()) {
      return null;
    }

    if (!message.from) {
      return null;
    }

    return {
      updateId,
      messageId: message.message_id,
      telegramUserId: message.from.id,
      chatId: message.chat.id,
      chatType: message.chat.type,
      text: message.text.trim(),
      messageDate: new Date(message.date * 1000),
      username: message.from.username,
      firstName: message.from.first_name,
      lastName: message.from.last_name,
    };
  }
}
