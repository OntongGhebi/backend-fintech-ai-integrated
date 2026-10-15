import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  const validBaseConfig = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/fintech',
    JWT_ACCESS_SECRET: 'development-access-secret',
    JWT_REFRESH_SECRET: 'development-refresh-secret',
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
        ...validBaseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'too-short',
        JWT_REFRESH_SECRET: 'a-different-but-long-enough-refresh-secret',
        FRONTEND_URL: 'https://app.example.com',
      }),
    ).toThrow('JWT_ACCESS_SECRET must contain at least 32 characters');
  });

  it('rejects a short refresh secret in production', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a-long-enough-access-secret-value-123',
        JWT_REFRESH_SECRET: 'too-short',
        FRONTEND_URL: 'https://app.example.com',
      }),
    ).toThrow('JWT_REFRESH_SECRET must contain at least 32 characters');
  });

  it('rejects identical access and refresh secrets in production', () => {
    const sharedSecret = 'a-shared-secret-that-is-longer-than-32';

    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: sharedSecret,
        JWT_REFRESH_SECRET: sharedSecret,
        FRONTEND_URL: 'https://app.example.com',
      }),
    ).toThrow('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  });

  it('requires FRONTEND_URL in production', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a-long-enough-access-secret-value-123',
        JWT_REFRESH_SECRET: 'a-long-enough-refresh-secret-value-456',
      }),
    ).toThrow('FRONTEND_URL is required in production');
  });

  it('rejects HTTP frontend URLs in production', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a-long-enough-access-secret-value-123',
        JWT_REFRESH_SECRET: 'a-long-enough-refresh-secret-value-456',
        FRONTEND_URL: 'http://app.example.com',
      }),
    ).toThrow('FRONTEND_URL must use HTTPS in production');
  });

  it('rejects malformed frontend URLs in production', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a-long-enough-access-secret-value-123',
        JWT_REFRESH_SECRET: 'a-long-enough-refresh-secret-value-456',
        FRONTEND_URL: 'not-a-valid-url',
      }),
    ).toThrow('FRONTEND_URL must be a valid HTTPS URL');
  });

  it('accepts secure production configuration', () => {
    const config = {
      ...validBaseConfig,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a-long-enough-access-secret-value-123',
      JWT_REFRESH_SECRET: 'a-long-enough-refresh-secret-value-456',
      FRONTEND_URL: 'https://app.example.com',
    };

    expect(validateEnvironment(config)).toEqual(config);
  });
});
