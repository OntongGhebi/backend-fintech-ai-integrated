import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { EmailVerificationService } from '../auth/services/email-verification.service';
import { PasswordService } from '../auth/services/password.service';

import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePreferencesDto } from './dto/update-preference.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  let usersRepository: {
    findById: jest.Mock;
    findByIdWithPreference: jest.Mock;
    findByEmail: jest.Mock;
    updateUser: jest.Mock;
    updatePreference: jest.Mock;
    changePasswordAndRevokeSessions: jest.Mock;
    findSessionsByUserId: jest.Mock;
    revokeSessionByIdAndUserId: jest.Mock;
    revokeAllSessionsByUserId: jest.Mock;
  };

  let passwordService: {
    compare: jest.Mock;
    hash: jest.Mock;
  };

  let emailVerificationService: {
    createAndSendToken: jest.Mock;
  };

  const user = {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hashed-password',
    name: 'Test User',
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  const preference = {
    id: 'preference-1',
    userId: 'user-1',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    locale: 'id-ID',
    weekStartsOn: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    usersRepository = {
      findById: jest.fn(),
      findByIdWithPreference: jest.fn(),
      findByEmail: jest.fn(),
      updateUser: jest.fn(),
      updatePreference: jest.fn(),
      changePasswordAndRevokeSessions: jest.fn(),
      findSessionsByUserId: jest.fn(),
      revokeSessionByIdAndUserId: jest.fn(),
      revokeAllSessionsByUserId: jest.fn(),
    };

    passwordService = {
      compare: jest.fn(),
      hash: jest.fn(),
    };

    emailVerificationService = {
      createAndSendToken: jest.fn(),
    };

    service = new UsersService(
      usersRepository as unknown as UsersRepository,
      emailVerificationService as unknown as EmailVerificationService,
      passwordService as unknown as PasswordService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return user by id', async () => {
      usersRepository.findById.mockResolvedValue(user);

      const result = await service.findById(user.id);

      expect(result).toEqual(user);
      expect(usersRepository.findById).toHaveBeenCalledWith(user.id);
    });
  });

  describe('findByIdWithPreference', () => {
    it('should return user with preference', async () => {
      const resultUser = {
        ...user,
        preferences: preference,
      };

      usersRepository.findByIdWithPreference.mockResolvedValue(resultUser);

      const result = await service.findByIdWithPreference(user.id);

      expect(result).toEqual(resultUser);
      expect(usersRepository.findByIdWithPreference).toHaveBeenCalledWith(
        user.id,
      );
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      usersRepository.findByEmail.mockResolvedValue(user);

      const result = await service.findByEmail(user.email);

      expect(result).toEqual(user);
      expect(usersRepository.findByEmail).toHaveBeenCalledWith(user.email);
    });
  });

  describe('getProfile', () => {
    it('should return sanitized user profile with preferences', async () => {
      usersRepository.findByIdWithPreference.mockResolvedValue({
        ...user,
        preferences: preference,
      });

      const result = await service.getProfile(user.id);

      expect(result).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: true,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        preferences: preference,
      });

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepository.findByIdWithPreference.mockResolvedValue(null);

      await expect(service.getProfile(user.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('should update name only', async () => {
      usersRepository.findById.mockResolvedValue(user);
      usersRepository.updateUser.mockResolvedValue({
        ...user,
        name: 'Updated User',
      });

      usersRepository.findByIdWithPreference.mockResolvedValue({
        ...user,
        name: 'Updated User',
        preferences: preference,
      });

      const dto: UpdateProfileDto = {
        name: '  Updated User  ',
      };

      const result = await service.updateProfile(user.id, dto);

      expect(usersRepository.updateUser).toHaveBeenCalledWith(user.id, {
        name: 'Updated User',
      });

      expect(result.name).toBe('Updated User');
    });

    it('should normalize email to lowercase', async () => {
      usersRepository.findById.mockResolvedValue(user);
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.updateUser.mockResolvedValue({
        ...user,
        email: 'new@example.com',
        emailVerifiedAt: null,
      });

      usersRepository.findByIdWithPreference.mockResolvedValue({
        ...user,
        email: 'new@example.com',
        emailVerifiedAt: null,
        preferences: preference,
      });

      const dto: UpdateProfileDto = {
        email: '  NEW@EXAMPLE.COM  ',
      };

      await service.updateProfile(user.id, dto);

      expect(usersRepository.findByEmail).toHaveBeenCalledWith(
        'new@example.com',
      );

      expect(usersRepository.updateUser).toHaveBeenCalledWith(user.id, {
        email: 'new@example.com',
        emailVerifiedAt: null,
      });
    });

    it('should reject email already used by another user', async () => {
      usersRepository.findById.mockResolvedValue(user);

      usersRepository.findByEmail.mockResolvedValue({
        ...user,
        id: 'another-user',
        email: 'existing@example.com',
      });

      const dto: UpdateProfileDto = {
        email: 'existing@example.com',
      };

      await expect(service.updateProfile(user.id, dto)).rejects.toThrow(
        ConflictException,
      );

      expect(usersRepository.updateUser).not.toHaveBeenCalled();
    });

    it('should invalidate email verification when email changes', async () => {
      usersRepository.findById
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce({
          ...user,
          email: 'new@example.com',
          emailVerifiedAt: null,
        });
      usersRepository.findByEmail.mockResolvedValue(null);

      const updatedUser = {
        ...user,
        email: 'new@example.com',
        emailVerifiedAt: null,
      };

      usersRepository.updateUser.mockResolvedValue(updatedUser);
      usersRepository.findByIdWithPreference.mockResolvedValue({
        ...updatedUser,
        preferences: preference,
      });

      await service.updateProfile(user.id, {
        email: 'new@example.com',
      });

      expect(usersRepository.updateUser).toHaveBeenCalledWith(user.id, {
        email: 'new@example.com',
        emailVerifiedAt: null,
      });

      expect(emailVerificationService.createAndSendToken).toHaveBeenCalledWith(
        user.id,
        'new@example.com',
        user.name,
      );
    });

    it('should return current profile without updating when no values change', async () => {
      usersRepository.findById.mockResolvedValue(user);

      usersRepository.findByIdWithPreference.mockResolvedValue({
        ...user,
        preferences: preference,
      });

      const result = await service.updateProfile(user.id, {
        name: user.name,
        email: user.email,
      });

      expect(usersRepository.updateUser).not.toHaveBeenCalled();

      expect(result.id).toBe(user.id);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateProfile(user.id, {
          name: 'Updated',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPreferences', () => {
    it('should return user preferences', async () => {
      usersRepository.findByIdWithPreference.mockResolvedValue({
        ...user,
        preferences: preference,
      });

      const result = await service.getPreferences(user.id);

      expect(result).toEqual({
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        locale: 'id-ID',
        weekStartsOn: 1,
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepository.findByIdWithPreference.mockResolvedValue(null);

      await expect(service.getPreferences(user.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updatePreferences', () => {
    it('should normalize currency to uppercase', async () => {
      usersRepository.findByIdWithPreference.mockResolvedValue({
        ...user,
        preferences: preference,
      });

      usersRepository.updatePreference.mockResolvedValue({
        ...preference,
        currency: 'USD',
      });

      const updatedPreference = {
        ...preference,
        currency: 'USD',
      };

      usersRepository.findByIdWithPreference
        .mockResolvedValueOnce({
          ...user,
          preferences: preference,
        })
        .mockResolvedValueOnce({
          ...user,
          preferences: updatedPreference,
        });

      const dto: UpdatePreferencesDto = {
        currency: ' usd ',
      };

      const result = await service.updatePreferences(user.id, dto);

      expect(usersRepository.updatePreference).toHaveBeenCalledWith(user.id, {
        currency: 'USD',
      });

      expect(result.currency).toBe('USD');
    });

    it('should trim timezone and locale', async () => {
      usersRepository.findByIdWithPreference
        .mockResolvedValueOnce({
          ...user,
          preferences: preference,
        })
        .mockResolvedValueOnce({
          ...user,
          preferences: {
            ...preference,
            timezone: 'Asia/Makassar',
            locale: 'en-US',
          },
        });

      usersRepository.updatePreference.mockResolvedValue({});

      await service.updatePreferences(user.id, {
        timezone: ' Asia/Makassar ',
        locale: ' en-US ',
      });

      expect(usersRepository.updatePreference).toHaveBeenCalledWith(user.id, {
        timezone: 'Asia/Makassar',
        locale: 'en-US',
      });
    });

    it('should update weekStartsOn', async () => {
      usersRepository.findByIdWithPreference
        .mockResolvedValueOnce({
          ...user,
          preferences: preference,
        })
        .mockResolvedValueOnce({
          ...user,
          preferences: {
            ...preference,
            weekStartsOn: 0,
          },
        });

      usersRepository.updatePreference.mockResolvedValue({});

      const result = await service.updatePreferences(user.id, {
        weekStartsOn: 0,
      });

      expect(usersRepository.updatePreference).toHaveBeenCalledWith(user.id, {
        weekStartsOn: 0,
      });

      expect(result.weekStartsOn).toBe(0);
    });

    it('should return current preferences when nothing changes', async () => {
      usersRepository.findByIdWithPreference.mockResolvedValue({
        ...user,
        preferences: preference,
      });

      const result = await service.updatePreferences(user.id, {});

      expect(usersRepository.updatePreference).not.toHaveBeenCalled();

      expect(result).toEqual({
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        locale: 'id-ID',
        weekStartsOn: 1,
      });
    });
  });

  describe('changePassword', () => {
    it('should change password and revoke sessions', async () => {
      passwordService.compare
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      passwordService.hash.mockResolvedValue('new-password-hash');

      usersRepository.findById.mockResolvedValue(user);

      usersRepository.changePasswordAndRevokeSessions.mockResolvedValue({
        passwordUpdated: true,
        sessionsRevoked: 3,
      });

      const dto: ChangePasswordDto = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      };

      const result = await service.changePassword(user.id, dto);

      expect(passwordService.compare).toHaveBeenNthCalledWith(
        1,
        'OldPassword123!',
        user.passwordHash,
      );

      expect(passwordService.compare).toHaveBeenNthCalledWith(
        2,
        'NewPassword123!',
        user.passwordHash,
      );

      expect(passwordService.hash).toHaveBeenCalledWith('NewPassword123!');

      expect(
        usersRepository.changePasswordAndRevokeSessions,
      ).toHaveBeenCalledWith(user.id, user.passwordHash, 'new-password-hash');

      expect(result).toEqual({
        message: 'Password changed successfully',
      });
    });

    it('should reject incorrect current password', async () => {
      usersRepository.findById.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(false);

      await expect(
        service.changePassword(user.id, {
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(passwordService.hash).not.toHaveBeenCalled();

      expect(
        usersRepository.changePasswordAndRevokeSessions,
      ).not.toHaveBeenCalled();
    });

    it('should reject when new password is the same as current password', async () => {
      usersRepository.findById.mockResolvedValue(user);

      passwordService.compare
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      await expect(
        service.changePassword(user.id, {
          currentPassword: 'OldPassword123!',
          newPassword: 'OldPassword123!',
        }),
      ).rejects.toThrow(ConflictException);

      expect(passwordService.hash).not.toHaveBeenCalled();

      expect(
        usersRepository.changePasswordAndRevokeSessions,
      ).not.toHaveBeenCalled();
    });

    it('should reject when user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.changePassword(user.id, {
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle concurrent password change safely', async () => {
      usersRepository.findById.mockResolvedValue(user);

      passwordService.compare
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      passwordService.hash.mockResolvedValue('new-password-hash');

      usersRepository.changePasswordAndRevokeSessions.mockResolvedValue({
        passwordUpdated: false,
        sessionsRevoked: 0,
      });

      await expect(
        service.changePassword(user.id, {
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getSessions', () => {
    it('should return sessions belonging to the user', async () => {
      const sessions = [
        {
          id: 'session-1',
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          lastUsedAt: null,
          expiresAt: new Date('2026-01-08T00:00:00.000Z'),
          revokedAt: null,
        },
      ];

      usersRepository.findById.mockResolvedValue(user);
      usersRepository.findSessionsByUserId.mockResolvedValue(sessions);

      const result = await service.getSessions(user.id);

      expect(result).toEqual({
        sessions,
      });

      expect(usersRepository.findSessionsByUserId).toHaveBeenCalledWith(
        user.id,
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.getSessions(user.id)).rejects.toThrow(
        NotFoundException,
      );

      expect(usersRepository.findSessionsByUserId).not.toHaveBeenCalled();
    });
  });

  describe('revokeSession', () => {
    it('should revoke a session belonging to the current user', async () => {
      usersRepository.revokeSessionByIdAndUserId.mockResolvedValue(1);

      const result = await service.revokeSession(user.id, 'session-1');

      expect(usersRepository.revokeSessionByIdAndUserId).toHaveBeenCalledWith(
        'session-1',
        user.id,
      );

      expect(result).toEqual({
        message: 'Session revoked successfully',
      });
    });

    it('should throw NotFoundException when session does not belong to user', async () => {
      usersRepository.revokeSessionByIdAndUserId.mockResolvedValue(0);

      await expect(
        service.revokeSession(user.id, 'another-user-session'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeAllSessions', () => {
    it('should revoke all active sessions', async () => {
      usersRepository.findById.mockResolvedValue(user);
      usersRepository.revokeAllSessionsByUserId.mockResolvedValue(4);

      const result = await service.revokeAllSessions(user.id);

      expect(usersRepository.revokeAllSessionsByUserId).toHaveBeenCalledWith(
        user.id,
      );

      expect(result).toEqual({
        message: 'All sessions revoked successfully',
        revokedCount: 4,
      });
    });

    it('should return zero when no active sessions exist', async () => {
      usersRepository.findById.mockResolvedValue(user);
      usersRepository.revokeAllSessionsByUserId.mockResolvedValue(0);

      const result = await service.revokeAllSessions(user.id);

      expect(result).toEqual({
        message: 'All sessions revoked successfully',
        revokedCount: 0,
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.revokeAllSessions(user.id)).rejects.toThrow(
        NotFoundException,
      );

      expect(usersRepository.revokeAllSessionsByUserId).not.toHaveBeenCalled();
    });
  });
});
