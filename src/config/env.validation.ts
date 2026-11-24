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
const MAX_PORT = 65535;
const MAX_AI_TIMEOUT_MS = 300000;

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

function validateIntegerSetting(
  config: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum?: number,
): void {
  const rawValue = config[key];

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return;
  }

  const value = Number(rawValue);

  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    (maximum !== undefined && value > maximum)
  ) {
    const range =
      maximum === undefined
        ? `at least ${minimum}`
        : `between ${minimum} and ${maximum}`;

    throw new Error(
      `Environment validation failed: ${key} must be an integer ${range}.`,
    );
  }
}

function validateApplicationConfiguration(
  config: Record<string, unknown>,
): void {
  validateIntegerSetting(config, 'PORT', 1, MAX_PORT);
  validateIntegerSetting(config, 'REDIS_PORT', 1, MAX_PORT);
  validateIntegerSetting(config, 'REDIS_DB', 0);
  validateIntegerSetting(config, 'AI_TIMEOUT_MS', 1, MAX_AI_TIMEOUT_MS);

  const apiPrefix = getNonEmptyString(config, 'API_PREFIX');

  if (
    apiPrefix &&
    !/^[A-Za-z0-9][A-Za-z0-9._~-]*(\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/.test(
      apiPrefix,
    )
  ) {
    throw new Error(
      'Environment validation failed: API_PREFIX must contain valid path segments without leading/trailing slashes, query strings, or fragments.',
    );
  }

  const timezone = getNonEmptyString(config, 'APP_TIMEZONE');

  if (timezone) {
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
      });
    } catch {
      throw new Error(
        'Environment validation failed: APP_TIMEZONE must be a valid IANA timezone.',
      );
    }
  }

  const frontendUrl = getNonEmptyString(config, 'FRONTEND_URL');

  if (frontendUrl) {
    let parsedFrontendUrl: URL;

    try {
      parsedFrontendUrl = new URL(frontendUrl);
    } catch {
      const expectedFormat =
        config.NODE_ENV === 'production'
          ? 'a valid HTTPS URL'
          : 'a valid HTTP or HTTPS origin';
      throw new Error(
        `Environment validation failed: FRONTEND_URL must be ${expectedFormat}.`,
      );
    }

    if (!['http:', 'https:'].includes(parsedFrontendUrl.protocol)) {
      throw new Error(
        'Environment validation failed: FRONTEND_URL must use HTTP or HTTPS.',
      );
    }

    if (
      parsedFrontendUrl.username ||
      parsedFrontendUrl.password ||
      (parsedFrontendUrl.pathname !== '' &&
        parsedFrontendUrl.pathname !== '/') ||
      parsedFrontendUrl.search ||
      parsedFrontendUrl.hash
    ) {
      throw new Error(
        'Environment validation failed: FRONTEND_URL must contain only the frontend origin without credentials, path, query, or fragment.',
      );
    }
  }

  const redisUrl = getNonEmptyString(config, 'REDIS_URL');

  if (redisUrl) {
    let parsedRedisUrl: URL;

    try {
      parsedRedisUrl = new URL(redisUrl);
    } catch {
      throw new Error(
        'Environment validation failed: REDIS_URL must be a valid Redis connection URL.',
      );
    }

    if (
      !['redis:', 'rediss:'].includes(parsedRedisUrl.protocol) ||
      !parsedRedisUrl.hostname
    ) {
      throw new Error(
        'Environment validation failed: REDIS_URL must use redis:// or rediss:// and contain a hostname.',
      );
    }

    if (parsedRedisUrl.port) {
      const redisUrlPort = Number(parsedRedisUrl.port);

      if (
        !Number.isInteger(redisUrlPort) ||
        redisUrlPort < 1 ||
        redisUrlPort > MAX_PORT
      ) {
        throw new Error(
          'Environment validation failed: REDIS_URL port must be between 1 and 65535.',
        );
      }
    }
  }
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

  const parsedFrontendUrl = new URL(frontendUrl);

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

  validateApplicationConfiguration(config);
  validateProductionSecurity(config);
  validateAiConfiguration(config);

  return config;
}
