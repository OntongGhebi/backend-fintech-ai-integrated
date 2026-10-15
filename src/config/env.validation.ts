import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

const MIN_PRODUCTION_SECRET_LENGTH = 32;

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
  DATABASE_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRES_IN?: string;

  @IsString()
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
  @IsString()
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

function validateProductionSecurity(config: Record<string, unknown>): void {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  const accessSecret =
    typeof config.JWT_ACCESS_SECRET === 'string'
      ? config.JWT_ACCESS_SECRET
      : '';

  const refreshSecret =
    typeof config.JWT_REFRESH_SECRET === 'string'
      ? config.JWT_REFRESH_SECRET
      : '';

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

  const frontendUrl =
    typeof config.FRONTEND_URL === 'string' ? config.FRONTEND_URL.trim() : '';

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

  return config;
}
