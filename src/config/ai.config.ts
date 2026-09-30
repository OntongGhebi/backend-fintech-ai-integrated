import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  enabled: process.env.AI_ENABLED === 'true',
  provider: process.env.AI_PROVIDER ?? 'none',
  apiKey: process.env.AI_API_KEY ?? '',
  baseUrl: process.env.AI_BASE_URL ?? '',
  model: process.env.AI_MODEL ?? '',
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
}));
