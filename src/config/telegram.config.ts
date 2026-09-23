import { registerAs } from '@nestjs/config';

export const telegramConfig = registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
  webhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? '',
}));
