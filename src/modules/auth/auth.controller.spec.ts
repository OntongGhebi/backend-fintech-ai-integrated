import { Test, TestingModule } from '@nestjs/testing';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

import { AccessTokenGuard } from './guards/access-token.guard';

import { EmailVerificationService } from './services/email-verification.service';

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    register: jest.fn(),
    login: jest.fn(),
  };

  const emailVerificationServiceMock = {
    verifyEmail: jest.fn(),
    verifyToken: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
        {
          provide: EmailVerificationService,
          useValue: emailVerificationServiceMock,
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    it('should call AuthService.register', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      };

      const expectedResult = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: false,
      };

      authServiceMock.register.mockResolvedValue(expectedResult);

      const result = await controller.register(dto);

      expect(authServiceMock.register).toHaveBeenCalledWith(dto);

      expect(result).toEqual(expectedResult);
    });
  });

  describe('verifyEmail', () => {
    it('should verify the email and return success message', async () => {
      const dto = {
        token: 'verification-token',
      };

      emailVerificationServiceMock.verifyEmail.mockResolvedValue(undefined);

      const result = await controller.verifyEmail(dto);

      expect(emailVerificationServiceMock.verifyEmail).toHaveBeenCalledWith(
        'verification-token',
      );

      expect(result).toEqual({
        message: 'Email verified successfully',
      });
    });
  });

  describe('login', () => {
    it('should call AuthService.login', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const expectedResult = {
        accessToken: 'test-access-token',
        user: {
          id: 'user-id',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true,
        },
      };

      authServiceMock.login.mockResolvedValue(expectedResult);

      const request = {
        headers: {
          'user-agent': 'jest-agent',
        },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('jest-agent'),
      } as any;

      const result = await controller.login(dto, request);

      expect(authServiceMock.login).toHaveBeenCalledWith(
        dto,
        '127.0.0.1',
        'jest-agent',
      );

      expect(result).toEqual(expectedResult);
    });
  });

  describe('getProtected', () => {
    it('should return authenticated user id from request', () => {
      const request = {
        user: {
          id: '11111111-1111-1111-1111-111111111111',
        },
      } as any;

      const result = controller.getProtected(request);

      expect(result).toEqual({
        message: 'Authenticated access granted',
        userId: '11111111-1111-1111-1111-111111111111',
      });
    });
  });
});
