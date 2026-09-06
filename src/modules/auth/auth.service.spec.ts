import { ConflictException } from '@nestjs/common';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockUser = {
    id: 'user-id',
    email: 'ghebi@example.com',
    name: 'Ghebi Armando',
    emailVerifiedAt: null,
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const passwordServiceMock = {
    hash: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AuthService(prismaMock as any, passwordServiceMock as any);
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      passwordServiceMock.hash.mockResolvedValue('hashed-password');

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue(mockUser),
          },
          userPreference: {
            create: jest.fn().mockResolvedValue({
              id: 'preference-id',
              userId: mockUser.id,
            }),
          },
        };

        return callback(tx);
      });

      const result = await service.register({
        email: '  GHEBI@EXAMPLE.COM ',
        password: 'Password123',
        name: '  Ghebi Armando  ',
      });

      expect(result).toEqual({
        id: 'user-id',
        email: 'ghebi@example.com',
        name: 'Ghebi Armando',
        emailVerified: false,
      });

      expect(passwordServiceMock.hash).toHaveBeenCalledWith('Password123');

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: {
          email: 'ghebi@example.com',
        },
        select: {
          id: true,
        },
      });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should reject registration when email already exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing-user-id',
      });

      await expect(
        service.register({
          email: 'ghebi@example.com',
          password: 'Password123',
          name: 'Ghebi Armando',
        }),
      ).rejects.toThrow(new ConflictException('Email is already registered'));

      expect(passwordServiceMock.hash).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('should never expose password hash in the response', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      passwordServiceMock.hash.mockResolvedValue('hashed-password');

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue(mockUser),
          },
          userPreference: {
            create: jest.fn().mockResolvedValue({
              id: 'preference-id',
              userId: mockUser.id,
            }),
          },
        };

        return callback(tx);
      });

      const result = await service.register({
        email: 'ghebi@example.com',
        password: 'Password123',
        name: 'Ghebi Armando',
      });

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should create user preference inside the same transaction', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      passwordServiceMock.hash.mockResolvedValue('hashed-password');

      const userCreateMock = jest.fn().mockResolvedValue(mockUser);

      const preferenceCreateMock = jest.fn().mockResolvedValue({
        id: 'preference-id',
        userId: mockUser.id,
      });

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: {
            create: userCreateMock,
          },
          userPreference: {
            create: preferenceCreateMock,
          },
        });
      });

      await service.register({
        email: 'ghebi@example.com',
        password: 'Password123',
        name: 'Ghebi Armando',
      });

      expect(userCreateMock).toHaveBeenCalledWith({
        data: {
          email: 'ghebi@example.com',
          passwordHash: 'hashed-password',
          name: 'Ghebi Armando',
        },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerifiedAt: true,
        },
      });

      expect(preferenceCreateMock).toHaveBeenCalledWith({
        data: {
          userId: 'user-id',
        },
      });
    });
  });
});
