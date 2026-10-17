import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

const MIN_PRODUCTION_SECRET_LENGTH = 32;
const SUPPORTED_AI_PROVIDERS = ['none', 'openai-compatible'] as const;

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsOptional()
  @IsNumberString()
  PORT?: string;

  @IsOptional()
  @IsString()
  API_PREFIX?: string;

  @IsOptional()
  @IsString()
  APP_TIMEZONE?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRES_IN?: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @IsNumberString()
  REDIS_PORT?: string;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsNumberString()
  REDIS_DB?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  AI_ENABLED?: string;

  @IsOptional()
  @IsIn([...SUPPORTED_AI_PROVIDERS])
  AI_PROVIDER?: string;

  @IsOptional()
  @IsString()
  AI_API_KEY?: string;

  @IsOptional()
  @IsString()
  AI_BASE_URL?: string;

  @IsOptional()
  @IsString()
  AI_MODEL?: string;

  @IsOptional()
  @IsNumberString()
  AI_TIMEOUT_MS?: string;
}

function getNonEmptyString(
  config: Record<string, unknown>,
  key: string,
): string {
  const value = config[key];

  return typeof value === 'string' ? value.trim() : '';
}

function validateProductionSecurity(config: Record<string, unknown>): void {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  const accessSecret = getNonEmptyString(config, 'JWT_ACCESS_SECRET');
  const refreshSecret = getNonEmptyString(config, 'JWT_REFRESH_SECRET');

  if (accessSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error(
      `Environment validation failed: JWT_ACCESS_SECRET must contain at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`,
    );
  }

  if (refreshSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error(
      `Environment validation failed: JWT_REFRESH_SECRET must contain at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`,
    );
  }

  if (accessSecret === refreshSecret) {
    throw new Error(
      'Environment validation failed: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different in production.',
    );
  }

  const frontendUrl = getNonEmptyString(config, 'FRONTEND_URL');

  if (!frontendUrl) {
    throw new Error(
      'Environment validation failed: FRONTEND_URL is required in production.',
    );
  }

  let parsedFrontendUrl: URL;

  try {
    parsedFrontendUrl = new URL(frontendUrl);
  } catch {
    throw new Error(
      'Environment validation failed: FRONTEND_URL must be a valid HTTPS URL in production.',
    );
  }

  if (parsedFrontendUrl.protocol !== 'https:') {
    throw new Error(
      'Environment validation failed: FRONTEND_URL must use HTTPS in production.',
    );
  }

  const redisUrl = getNonEmptyString(config, 'REDIS_URL');
  const redisHost = getNonEmptyString(config, 'REDIS_HOST');

  if (!redisUrl && !redisHost) {
    throw new Error(
      'Environment validation failed: REDIS_URL or REDIS_HOST must be explicitly configured in production.',
    );
  }
}

function validateAiConfiguration(config: Record<string, unknown>): void {
  const provider = getNonEmptyString(config, 'AI_PROVIDER') || 'none';
  const explicitlyEnabled = config.AI_ENABLED === 'true';
  const providerConfigured = provider !== 'none';
  const aiEnabled = explicitlyEnabled || providerConfigured;

  if (!aiEnabled) {
    return;
  }

  if (provider === 'none') {
    throw new Error(
      'Environment validation failed: AI_PROVIDER must be configured when AI_ENABLED=true.',
    );
  }

  const apiKey = getNonEmptyString(config, 'AI_API_KEY');
  const baseUrl = getNonEmptyString(config, 'AI_BASE_URL');
  const model = getNonEmptyString(config, 'AI_MODEL');

  if (!apiKey) {
    throw new Error(
      'Environment validation failed: AI_API_KEY is required when AI is enabled.',
    );
  }

  if (!baseUrl) {
    throw new Error(
      'Environment validation failed: AI_BASE_URL is required when AI is enabled.',
    );
  }

  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error(
      'Environment validation failed: AI_BASE_URL must be a valid HTTP or HTTPS URL when AI is enabled.',
    );
  }

  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    throw new Error(
      'Environment validation failed: AI_BASE_URL must use HTTP or HTTPS when AI is enabled.',
    );
  }

  if (!model) {
    throw new Error(
      'Environment validation failed: AI_MODEL is required when AI is enabled.',
    );
  }
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  validateProductionSecurity(config);
  validateAiConfiguration(config);

  return config;
}
