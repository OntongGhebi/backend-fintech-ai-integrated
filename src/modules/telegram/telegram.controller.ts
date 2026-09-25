import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { TelegramAccountService } from './telegram-account.service';
import { TelegramIncomingMessageService } from './telegram-incoming-message.service';
import { TelegramMessageProcessingService } from './telegram-message-processing.service';
import { TelegramService } from './telegram.service';
import { TelegramUpdateParserService } from './telegram-update-parser.service';
import { TelegramWebhookGuard } from './telegram-webhook.guard';
import { TelegramUpdateDto } from './dto/telegram-update.dto';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly telegramUpdateParserService: TelegramUpdateParserService,
    private readonly telegramAccountService: TelegramAccountService,
    private readonly telegramIncomingMessageService: TelegramIncomingMessageService,
    private readonly telegramMessageProcessingService: TelegramMessageProcessingService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TelegramWebhookGuard)
  async handleWebhook(
    @Body() update: TelegramUpdateDto,
  ): Promise<{ ok: boolean }> {
    const parsedMessage = this.telegramUpdateParserService.parse(update);

    if (!parsedMessage) {
      this.telegramService.handleUpdate(null);

      return { ok: true };
    }

    const persistedMessage =
      await this.telegramIncomingMessageService.persist(parsedMessage);

    if (!persistedMessage) {
      this.telegramService.handleUpdate(parsedMessage);

      return { ok: true };
    }

    if (!persistedMessage.created) {
      this.telegramService.handleUpdate(parsedMessage);

      return { ok: true };
    }

    await this.telegramMessageProcessingService.process({
      messageId: persistedMessage.id,
      userId: persistedMessage.userId,
      telegramAccountId: persistedMessage.telegramAccountId,
      telegramUserId: persistedMessage.telegramUserId,
      chatId: persistedMessage.chatId,
      telegramMessageId: persistedMessage.telegramMessageId,
      messageType: persistedMessage.messageType,
      content: persistedMessage.content,
    });

    this.telegramService.handleUpdate(parsedMessage);

    return { ok: true };
  }

  @Post('link')
  @UseGuards(AccessTokenGuard)
  async createLinkCode(
    @Req()
    request: {
      user: {
        sub: string;
      };
    },
  ) {
    return this.telegramAccountService.createLinkCode(request.user.sub);
  }
}
