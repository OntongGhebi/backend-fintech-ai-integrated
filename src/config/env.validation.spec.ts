import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  const validBaseConfig = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/fintech',
    JWT_ACCESS_SECRET: 'development-access-secret',
    JWT_REFRESH_SECRET: 'development-refresh-secret',
  };

  const validProductionConfig = {
    ...validBaseConfig,
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'a-long-enough-access-secret-value-123',
    JWT_REFRESH_SECRET: 'a-long-enough-refresh-secret-value-456',
    FRONTEND_URL: 'https://app.example.com',
    REDIS_HOST: 'redis.example.internal',
  };

  it('accepts a valid development configuration', () => {
    expect(validateEnvironment(validBaseConfig)).toEqual(validBaseConfig);
  });

  it('rejects a missing database URL', () => {
    const config = {
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: 'development-access-secret',
      JWT_REFRESH_SECRET: 'development-refresh-secret',
    };

    expect(() => validateEnvironment(config)).toThrow(
      'Environment validation failed:',
    );
  });

  it('rejects an empty database URL', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        DATABASE_URL: '',
      }),
    ).toThrow('Environment validation failed:');
  });

  it('rejects an empty access secret', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        JWT_ACCESS_SECRET: '',
      }),
    ).toThrow('Environment validation failed:');
  });

  it('rejects an empty refresh secret', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        JWT_REFRESH_SECRET: '',
      }),
    ).toThrow('Environment validation failed:');
  });

  it('rejects an unsupported NODE_ENV value', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        NODE_ENV: 'staging',
      }),
    ).toThrow('Environment validation failed:');
  });

  it('does not apply production-only secret rules in test mode', () => {
    const config = {
      ...validBaseConfig,
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'short-access',
      JWT_REFRESH_SECRET: 'short-refresh',
    };

    expect(validateEnvironment(config)).toEqual(config);
  });

  it('rejects a short access secret in production', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionConfig,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow('JWT_ACCESS_SECRET must contain at least 32 characters');
  });

  it('rejects a short refresh secret in production', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionConfig,
        JWT_REFRESH_SECRET: 'too-short',
      }),
    ).toThrow('JWT_REFRESH_SECRET must contain at least 32 characters');
  });

  it('rejects identical access and refresh secrets in production', () => {
    const sharedSecret = 'a-shared-secret-that-is-longer-than-32';

    expect(() =>
      validateEnvironment({
        ...validProductionConfig,
        JWT_ACCESS_SECRET: sharedSecret,
        JWT_REFRESH_SECRET: sharedSecret,
      }),
    ).toThrow('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  });

  it('requires FRONTEND_URL in production', () => {
    const { FRONTEND_URL: _frontendUrl, ...config } = validProductionConfig;

    expect(() => validateEnvironment(config)).toThrow(
      'FRONTEND_URL is required in production',
    );
  });

  it('rejects HTTP frontend URLs in production', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionConfig,
        FRONTEND_URL: 'http://app.example.com',
      }),
    ).toThrow('FRONTEND_URL must use HTTPS in production');
  });

  it('rejects malformed frontend URLs in production', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionConfig,
        FRONTEND_URL: 'not-a-valid-url',
      }),
    ).toThrow('FRONTEND_URL must be a valid HTTPS URL');
  });

  it('requires explicit Redis configuration in production', () => {
    const { REDIS_HOST: _redisHost, ...config } = validProductionConfig;

    expect(() => validateEnvironment(config)).toThrow(
      'REDIS_URL or REDIS_HOST must be explicitly configured in production',
    );
  });

  it('accepts REDIS_URL instead of REDIS_HOST in production', () => {
    const { REDIS_HOST: _redisHost, ...config } = validProductionConfig;

    const configWithRedisUrl = {
      ...config,
      REDIS_URL: 'redis://redis.example.internal:6379',
    };

    expect(validateEnvironment(configWithRedisUrl)).toEqual(configWithRedisUrl);
  });

  it('accepts secure production configuration', () => {
    expect(validateEnvironment(validProductionConfig)).toEqual(
      validProductionConfig,
    );
  });

  it('accepts AI disabled with empty optional AI settings', () => {
    const config = {
      ...validBaseConfig,
      AI_ENABLED: 'false',
      AI_PROVIDER: 'none',
      AI_API_KEY: '',
      AI_BASE_URL: '',
      AI_MODEL: '',
    };

    expect(validateEnvironment(config)).toEqual(config);
  });

  it('accepts AI disabled when AI settings are omitted', () => {
    expect(validateEnvironment(validBaseConfig)).toEqual(validBaseConfig);
  });

  it('rejects unsupported AI providers', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        AI_PROVIDER: 'unsupported-provider',
      }),
    ).toThrow('Environment validation failed:');
  });

  it('rejects AI_ENABLED=true when provider is none', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        AI_ENABLED: 'true',
        AI_PROVIDER: 'none',
      }),
    ).toThrow('AI_PROVIDER must be configured when AI_ENABLED=true');
  });

  it('requires an API key when AI is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        AI_ENABLED: 'true',
        AI_PROVIDER: 'openai-compatible',
        AI_API_KEY: '',
        AI_BASE_URL: 'https://api.example.com/v1',
        AI_MODEL: 'test-model',
      }),
    ).toThrow('AI_API_KEY is required when AI is enabled');
  });

  it('requires a base URL when AI is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        AI_ENABLED: 'true',
        AI_PROVIDER: 'openai-compatible',
        AI_API_KEY: 'test-key',
        AI_BASE_URL: '',
        AI_MODEL: 'test-model',
      }),
    ).toThrow('AI_BASE_URL is required when AI is enabled');
  });

  it('rejects malformed AI base URLs', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        AI_ENABLED: 'true',
        AI_PROVIDER: 'openai-compatible',
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'not-a-url',
        AI_MODEL: 'test-model',
      }),
    ).toThrow('AI_BASE_URL must be a valid HTTP or HTTPS URL');
  });

  it('requires a model when AI is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        AI_ENABLED: 'true',
        AI_PROVIDER: 'openai-compatible',
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'https://api.example.com/v1',
        AI_MODEL: '',
      }),
    ).toThrow('AI_MODEL is required when AI is enabled');
  });

  it('accepts complete OpenAI-compatible AI configuration', () => {
    const config = {
      ...validBaseConfig,
      AI_ENABLED: 'true',
      AI_PROVIDER: 'openai-compatible',
      AI_API_KEY: 'test-key',
      AI_BASE_URL: 'https://api.example.com/v1',
      AI_MODEL: 'test-model',
    };

    expect(validateEnvironment(config)).toEqual(config);
  });

  it('requires AI credentials when a provider is configured even if AI_ENABLED is false', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        AI_ENABLED: 'false',
        AI_PROVIDER: 'openai-compatible',
        AI_API_KEY: '',
        AI_BASE_URL: '',
        AI_MODEL: '',
      }),
    ).toThrow('AI_API_KEY is required when AI is enabled');
  });
});
