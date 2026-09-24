import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramWebhookGuard } from './telegram-webhook.guard';
import { TelegramUpdateParserService } from './telegram-update-parser.service';
import { TelegramAccountService } from './telegram-account.service';
import { TelegramLinkTokenService } from './telegram-link-token.service';
import { TelegramAccountRepository } from './repositories/telegram-account.repository';

@Module({
  imports: [ConfigModule],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramAccountService,
    TelegramLinkTokenService,
    TelegramUpdateParserService,
    TelegramWebhookGuard,
    TelegramAccountRepository,
  ],
  exports: [
    TelegramService,
    TelegramAccountService,
    TelegramUpdateParserService,
  ],
})
export class TelegramModule {}
