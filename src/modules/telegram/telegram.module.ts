import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramWebhookGuard } from './telegram-webhook.guard';

@Module({
  imports: [ConfigModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramWebhookGuard],
  exports: [TelegramService],
})
export class TelegramModule {}
