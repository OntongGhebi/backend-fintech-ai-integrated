import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { TelegramWebhookGuard } from './telegram-webhook.guard';
import { TelegramService } from './telegram.service';
import type { TelegramUpdate } from './telegram.types';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TelegramWebhookGuard)
  handleWebhook(@Body() update: TelegramUpdate): { ok: boolean } {
    this.telegramService.handleUpdate(update);

    return {
      ok: true,
    };
  }
}
