import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AccessTokenStrategy } from './access-token.strategy';

describe('AccessTokenStrategy', () => {
  let strategy: AccessTokenStrategy;

  const configServiceMock = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'jwt.accessSecret') {
        return 'test-access-secret';
      }

      return undefined;
    });

    strategy = new AccessTokenStrategy(configServiceMock as ConfigService);
  });

  describe('constructor', () => {
    it('should throw when JWT access secret is not configured', () => {
      configServiceMock.get.mockReturnValue(undefined);

      expect(
        () => new AccessTokenStrategy(configServiceMock as ConfigService),
      ).toThrow('JWT_ACCESS_SECRET is not configured');
    });
  });

  describe('validate', () => {
    it('should validate a valid JWT payload', async () => {
      const payload = {
        sub: '11111111-1111-1111-1111-111111111111',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        id: payload.sub,
      });
    });

    it('should reject payload without subject', () => {
      const payload = {};

      expect(() => strategy.validate(payload)).toThrow(
        new UnauthorizedException('Invalid access token'),
      );
    });

    it('should reject payload with empty subject', () => {
      const payload = {
        sub: '',
      };

      expect(() => strategy.validate(payload)).toThrow(
        new UnauthorizedException('Invalid access token'),
      );
    });

    it('should reject null payload', () => {
      expect(() => strategy.validate(null as any)).toThrow(
        new UnauthorizedException('Invalid access token'),
      );
    });

    it('should return only the authenticated user id', async () => {
      const payload = {
        sub: '11111111-1111-1111-1111-111111111111',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        id: payload.sub,
      });

      expect(result).not.toHaveProperty('password');

      expect(result).not.toHaveProperty('passwordHash');

      expect(result).not.toHaveProperty('email');
    });
  });
});
