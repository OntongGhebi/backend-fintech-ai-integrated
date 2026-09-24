import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { TelegramAccountService } from './telegram-account.service';
import { TelegramService } from './telegram.service';
import { TelegramUpdateParserService } from './telegram-update-parser.service';
import { TelegramWebhookGuard } from './telegram-webhook.guard';
import { TelegramUpdateDto } from './dto/telegram-update.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { TelegramIncomingMessageService } from './telegram-incoming-message.service';

interface AuthenticatedTelegramRequest {
  user: {
    sub: string;
  };
}

interface CreateTelegramLinkCodeResponse {
  code: string;
  expiresInSeconds: number;
}

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly telegramUpdateParserService: TelegramUpdateParserService,
    private readonly telegramAccountService: TelegramAccountService,
    private readonly telegramIncomingMessageService: TelegramIncomingMessageService,
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

      return {
        ok: true,
      };
    }

    await this.telegramIncomingMessageService.persist(parsedMessage);

    this.telegramService.handleUpdate(parsedMessage);

    return {
      ok: true,
    };
  }

  @Post('link')
  @UseGuards(AccessTokenGuard)
  createLinkCode(
    @Req() request: AuthenticatedTelegramRequest,
  ): Promise<CreateTelegramLinkCodeResponse> {
    return this.telegramAccountService.createLinkCode(request.user.sub);
  }
}
