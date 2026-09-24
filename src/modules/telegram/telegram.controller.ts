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
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TelegramWebhookGuard)
  handleWebhook(@Body() update: TelegramUpdateDto): { ok: boolean } {
    const parsedMessage = this.telegramUpdateParserService.parse(update);

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
