import { registerAs } from '@nestjs/config';

function parseFallbackModels(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  ];
}

export default registerAs('ai', () => {
  const provider = process.env.AI_PROVIDER ?? 'none';
  const isExplicitlyEnabled = process.env.AI_ENABLED === 'true';
  const hasConfiguredProvider = provider !== 'none' && !!provider;

  const model = process.env.AI_MODEL?.trim() ?? '';
  const fallbackModels = parseFallbackModels(
    process.env.AI_FALLBACK_MODELS,
  ).filter((fallbackModel) => fallbackModel !== model);

  return {
    enabled: isExplicitlyEnabled || hasConfiguredProvider,
    provider,
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: process.env.AI_BASE_URL ?? '',
    model,
    fallbackModels,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
  };
});
