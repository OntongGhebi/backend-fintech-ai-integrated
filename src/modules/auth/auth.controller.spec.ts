import { Test, TestingModule } from '@nestjs/testing';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { EmailVerificationService } from './services/email-verification.service';

describe('AuthController', () => {
  let controller: AuthController;

  const authMock = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  };

  const emailVerificationMock = {
    verifyEmail: jest.fn(),
    verifyToken: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authMock },
        {
          provide: EmailVerificationService,
          useValue: emailVerificationMock,
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get(AuthController);
  });

  describe('register', () => {
    it('delegates registration to AuthService', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      };

      const expected = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: false,
      };

      authMock.register.mockResolvedValue(expected);

      await expect(controller.register(dto)).resolves.toEqual(expected);
      expect(authMock.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('verifyEmail', () => {
    it('verifies the supplied token', async () => {
      emailVerificationMock.verifyEmail.mockResolvedValue(undefined);

      await expect(
        controller.verifyEmail({ token: 'verification-token' }),
      ).resolves.toEqual({
        message: 'Email verified successfully',
      });

      expect(emailVerificationMock.verifyEmail).toHaveBeenCalledWith(
        'verification-token',
      );
    });

    it('propagates verification errors', async () => {
      emailVerificationMock.verifyEmail.mockRejectedValue(
        new Error('Invalid verification token'),
      );

      await expect(
        controller.verifyEmail({ token: 'invalid-token' }),
      ).rejects.toThrow('Invalid verification token');
    });
  });

  describe('login', () => {
    const dto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('passes request IP and user agent to AuthService', async () => {
      const expected = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: {
          id: 'user-id',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true,
        },
      };

      authMock.login.mockResolvedValue(expected);

      const request = {
        headers: {},
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('jest-agent'),
      } as any;

      await expect(controller.login(dto, request)).resolves.toEqual(expected);

      expect(authMock.login).toHaveBeenCalledWith(
        dto,
        '127.0.0.1',
        'jest-agent',
      );
    });

    it('uses the first forwarded IP address when it is a string', async () => {
      authMock.login.mockResolvedValue({ accessToken: 'token' });

      const request = {
        headers: {
          'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('jest-agent'),
      } as any;

      await controller.login(dto, request);

      expect(authMock.login).toHaveBeenCalledWith(
        dto,
        '203.0.113.10',
        'jest-agent',
      );
    });

    it('uses the first forwarded IP address when it is an array', async () => {
      authMock.login.mockResolvedValue({ accessToken: 'token' });

      const request = {
        headers: {
          'x-forwarded-for': ['203.0.113.20', '10.0.0.1'],
        },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('jest-agent'),
      } as any;

      await controller.login(dto, request);

      expect(authMock.login).toHaveBeenCalledWith(
        dto,
        '203.0.113.20',
        'jest-agent',
      );
    });

    it('falls back to request IP when forwarded IP is unavailable', async () => {
      authMock.login.mockResolvedValue({ accessToken: 'token' });

      const request = {
        headers: {},
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue(undefined),
      } as any;

      await controller.login(dto, request);

      expect(authMock.login).toHaveBeenCalledWith(dto, '127.0.0.1', undefined);
    });
  });

  describe('refresh', () => {
    it('passes the refresh token to AuthService', async () => {
      const expected = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      authMock.refresh.mockResolvedValue(expected);

      await expect(
        controller.refresh({
          refreshToken: 'old-refresh-token',
        }),
      ).resolves.toEqual(expected);

      expect(authMock.refresh).toHaveBeenCalledWith('old-refresh-token');
    });

    it('propagates refresh errors', async () => {
      authMock.refresh.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(
        controller.refresh({
          refreshToken: 'invalid-token',
        }),
      ).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('logout', () => {
    it('passes refresh token and authenticated identity to AuthService', async () => {
      const dto = {
        refreshToken: 'valid-refresh-token',
      };

      const request = {
        user: {
          id: 'authenticated-user-id',
          sid: 'authenticated-session-id',
        },
      } as any;

      const expected = {
        message: 'Logout successfully',
      };

      authMock.logout.mockResolvedValue(expected);

      await expect(controller.logout(dto, request)).resolves.toEqual(expected);

      expect(authMock.logout).toHaveBeenCalledWith(
        'valid-refresh-token',
        'authenticated-user-id',
        'authenticated-session-id',
      );
    });

    it('does not use user or session identifiers from the request body', async () => {
      const dto = {
        refreshToken: 'valid-refresh-token',
        userId: 'attacker-user-id',
        sessionId: 'attacker-session-id',
      } as any;

      const request = {
        user: {
          id: 'authenticated-user-id',
          sid: 'authenticated-session-id',
        },
      } as any;

      authMock.logout.mockResolvedValue({
        message: 'Logout successfully',
      });

      await controller.logout(dto, request);

      expect(authMock.logout).toHaveBeenCalledWith(
        'valid-refresh-token',
        'authenticated-user-id',
        'authenticated-session-id',
      );

      expect(authMock.logout).not.toHaveBeenCalledWith(
        'valid-refresh-token',
        'attacker-user-id',
        'attacker-session-id',
      );
    });

    it('propagates logout errors', async () => {
      authMock.logout.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(
        controller.logout({ refreshToken: 'invalid-token' }, {
          user: {
            id: 'user-id',
            sid: 'session-id',
          },
        } as any),
      ).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('me', () => {
    it('passes the authenticated user id to AuthService', async () => {
      const expected = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
      };

      authMock.me.mockResolvedValue(expected);

      await expect(controller.me('user-id')).resolves.toEqual(expected);

      expect(authMock.me).toHaveBeenCalledWith('user-id');
    });
  });

  describe('getProtected', () => {
    it('returns the authenticated user id', () => {
      expect(
        controller.getProtected('11111111-1111-1111-1111-111111111111'),
      ).toEqual({
        message: 'Authenticated access granted',
        userId: '11111111-1111-1111-1111-111111111111',
      });
    });
  });
});
