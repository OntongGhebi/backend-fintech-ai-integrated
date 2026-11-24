import { validateEnvironment } from './env.validation';

describe('Environment infrastructure validation', () => {
  const baseConfig = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/fintech',
    JWT_ACCESS_SECRET: 'development-access-secret',
    JWT_REFRESH_SECRET: 'development-refresh-secret',
  };

  describe('application port', () => {
    it.each(['0', '-1', '65536', '3000.5', 'abc'])(
      'rejects invalid PORT value %s',
      (PORT) => {
        expect(() =>
          validateEnvironment({
            ...baseConfig,
            PORT,
          }),
        ).toThrow('Environment validation failed');
      },
    );

    it.each(['1', '3000', '65535'])('accepts valid PORT value %s', (PORT) => {
      expect(
        validateEnvironment({
          ...baseConfig,
          PORT,
        }),
      ).toEqual({
        ...baseConfig,
        PORT,
      });
    });
  });

  describe('Redis configuration', () => {
    it.each(['0', '-1', '65536', '6379.5', 'abc'])(
      'rejects invalid REDIS_PORT value %s',
      (REDIS_PORT) => {
        expect(() =>
          validateEnvironment({
            ...baseConfig,
            REDIS_PORT,
          }),
        ).toThrow('Environment validation failed');
      },
    );

    it.each(['0', '1', '15', '100'])(
      'accepts non-negative REDIS_DB value %s',
      (REDIS_DB) => {
        expect(
          validateEnvironment({
            ...baseConfig,
            REDIS_DB,
          }),
        ).toEqual({
          ...baseConfig,
          REDIS_DB,
        });
      },
    );

    it.each(['-1', '1.5', 'abc'])(
      'rejects invalid REDIS_DB value %s',
      (REDIS_DB) => {
        expect(() =>
          validateEnvironment({
            ...baseConfig,
            REDIS_DB,
          }),
        ).toThrow('Environment validation failed');
      },
    );

    it.each([
      'http://localhost:6379',
      'https://localhost:6379',
      'not-a-url',
      'redis://',
    ])('rejects unsupported REDIS_URL %s', (REDIS_URL) => {
      expect(() =>
        validateEnvironment({
          ...baseConfig,
          REDIS_URL,
        }),
      ).toThrow('REDIS_URL');
    });

    it.each(['redis://localhost:6379', 'rediss://redis.example.com:6380'])(
      'accepts valid REDIS_URL %s',
      (REDIS_URL) => {
        expect(
          validateEnvironment({
            ...baseConfig,
            REDIS_URL,
          }),
        ).toEqual({
          ...baseConfig,
          REDIS_URL,
        });
      },
    );
  });

  describe('frontend origin', () => {
    it('accepts a local development origin', () => {
      const config = {
        ...baseConfig,
        FRONTEND_URL: 'http://localhost:5173',
      };

      expect(validateEnvironment(config)).toEqual(config);
    });

    it('rejects frontend URLs containing a path', () => {
      expect(() =>
        validateEnvironment({
          ...baseConfig,
          FRONTEND_URL: 'http://localhost:5173/dashboard',
        }),
      ).toThrow('FRONTEND_URL must contain only the frontend origin');
    });

    it('rejects frontend URLs containing query parameters', () => {
      expect(() =>
        validateEnvironment({
          ...baseConfig,
          FRONTEND_URL: 'http://localhost:5173?token=secret',
        }),
      ).toThrow('FRONTEND_URL must contain only the frontend origin');
    });

    it('rejects unsupported frontend protocols', () => {
      expect(() =>
        validateEnvironment({
          ...baseConfig,
          FRONTEND_URL: 'ftp://localhost:5173',
        }),
      ).toThrow('FRONTEND_URL must use HTTP or HTTPS');
    });
  });

  describe('API prefix', () => {
    it.each([
      '/api/v1',
      'api/v1/',
      'api//v1',
      'api/v1?debug=true',
      'api/v1#fragment',
    ])('rejects invalid API_PREFIX %s', (API_PREFIX) => {
      expect(() =>
        validateEnvironment({
          ...baseConfig,
          API_PREFIX,
        }),
      ).toThrow('API_PREFIX');
    });

    it.each(['api/v1', 'api/v2', 'v1'])(
      'accepts valid API_PREFIX %s',
      (API_PREFIX) => {
        expect(
          validateEnvironment({
            ...baseConfig,
            API_PREFIX,
          }),
        ).toEqual({
          ...baseConfig,
          API_PREFIX,
        });
      },
    );
  });

  describe('timezone', () => {
    it('accepts Asia/Jakarta', () => {
      const config = {
        ...baseConfig,
        APP_TIMEZONE: 'Asia/Jakarta',
      };

      expect(validateEnvironment(config)).toEqual(config);
    });

    it('rejects an unknown timezone', () => {
      expect(() =>
        validateEnvironment({
          ...baseConfig,
          APP_TIMEZONE: 'Invalid/Timezone',
        }),
      ).toThrow('APP_TIMEZONE must be a valid IANA timezone');
    });
  });

  describe('AI timeout', () => {
    it.each(['0', '-1', '1.5', 'abc', '300001'])(
      'rejects invalid AI_TIMEOUT_MS value %s',
      (AI_TIMEOUT_MS) => {
        expect(() =>
          validateEnvironment({
            ...baseConfig,
            AI_TIMEOUT_MS,
          }),
        ).toThrow('AI_TIMEOUT_MS');
      },
    );

    it.each(['1', '30000', '300000'])(
      'accepts valid AI_TIMEOUT_MS value %s',
      (AI_TIMEOUT_MS) => {
        expect(
          validateEnvironment({
            ...baseConfig,
            AI_TIMEOUT_MS,
          }),
        ).toEqual({
          ...baseConfig,
          AI_TIMEOUT_MS,
        });
      },
    );
  });
});
