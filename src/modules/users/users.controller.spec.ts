import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  let usersService: {
    getProfile: jest.Mock;
    updateProfile: jest.Mock;
    getPreferences: jest.Mock;
    updatePreferences: jest.Mock;
    changePassword: jest.Mock;
    getSessions: jest.Mock;
    revokeSession: jest.Mock;
    revokeAllSessions: jest.Mock;
  };

  beforeEach(() => {
    usersService = {
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
      changePassword: jest.fn(),
      getSessions: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllSessions: jest.fn(),
    };

    controller = new UsersController(usersService as unknown as UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should delegate to UsersService', async () => {
      const expected = {
        id: 'user-1',
        email: 'user@example.com',
      };

      usersService.getProfile.mockResolvedValue(expected);

      const result = await controller.getProfile('user-1');

      expect(result).toEqual(expected);
      expect(usersService.getProfile).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateProfile', () => {
    it('should delegate to UsersService', async () => {
      const dto = {
        name: 'Updated User',
      };

      usersService.updateProfile.mockResolvedValue({
        id: 'user-1',
        name: 'Updated User',
      });

      const result = await controller.updateProfile('user-1', dto);

      expect(result).toEqual({
        id: 'user-1',
        name: 'Updated User',
      });

      expect(usersService.updateProfile).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getPreferences', () => {
    it('should delegate to UsersService', async () => {
      const expected = {
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        locale: 'id-ID',
        weekStartsOn: 1,
      };

      usersService.getPreferences.mockResolvedValue(expected);

      const result = await controller.getPreferences('user-1');

      expect(result).toEqual(expected);
      expect(usersService.getPreferences).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updatePreferences', () => {
    it('should delegate to UsersService', async () => {
      const dto = {
        currency: 'USD',
      };

      usersService.updatePreferences.mockResolvedValue({
        currency: 'USD',
      });

      const result = await controller.updatePreferences('user-1', dto);

      expect(result).toEqual({
        currency: 'USD',
      });

      expect(usersService.updatePreferences).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
    });
  });

  describe('changePassword', () => {
    it('should delegate to UsersService', async () => {
      const dto = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      };

      const expected = {
        message: 'Password changed successfully',
      };

      usersService.changePassword.mockResolvedValue(expected);

      const result = await controller.changePassword('user-1', dto);

      expect(result).toEqual(expected);

      expect(usersService.changePassword).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getSessions', () => {
    it('should delegate to UsersService', async () => {
      const expected = {
        sessions: [
          {
            id: 'session-1',
            ipAddress: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
            createdAt: new Date(),
            lastUsedAt: null,
            expiresAt: new Date(),
            revokedAt: null,
          },
        ],
      };

      usersService.getSessions.mockResolvedValue(expected);

      const result = await controller.getSessions('user-1');

      expect(result).toEqual(expected);
      expect(usersService.getSessions).toHaveBeenCalledWith('user-1');
    });
  });

  describe('revokeSession', () => {
    it('should delegate session id and user id', async () => {
      const expected = {
        message: 'Session revoked successfully',
      };

      usersService.revokeSession.mockResolvedValue(expected);

      const result = await controller.revokeSession('user-1', 'session-1');

      expect(result).toEqual(expected);

      expect(usersService.revokeSession).toHaveBeenCalledWith(
        'user-1',
        'session-1',
      );
    });
  });

  describe('revokeAllSessions', () => {
    it('should delegate to UsersService', async () => {
      const expected = {
        message: 'All sessions revoked successfully',
        revokedCount: 3,
      };

      usersService.revokeAllSessions.mockResolvedValue(expected);

      const result = await controller.revokeAllSessions('user-1');

      expect(result).toEqual(expected);

      expect(usersService.revokeAllSessions).toHaveBeenCalledWith('user-1');
    });
  });
});
