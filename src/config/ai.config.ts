import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => {
  const provider = process.env.AI_PROVIDER ?? 'none';
  const isExplicitlyEnabled = process.env.AI_ENABLED === 'true';
  const hasConfiguredProvider = provider !== 'none' && !!provider;

  return {
    enabled: isExplicitlyEnabled || hasConfiguredProvider,
    provider,
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: process.env.AI_BASE_URL ?? '',
    model: process.env.AI_MODEL ?? '',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
  };
});
