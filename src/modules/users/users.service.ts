import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { EmailVerificationService } from '../auth/services/email-verification.service';
import { UpdatePreferencesDto } from './dto/update-preference.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordService } from '../auth/services/password.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly passwordService: PasswordService,
  ) {}

  async findById(userId: string) {
    return this.usersRepository.findById(userId);
  }

  async findByIdWithPreference(userId: string) {
    return this.usersRepository.findByIdWithPreference(userId);
  }

  async findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  async getProfile(userId: string) {
    const user = await this.usersRepository.findByIdWithPreference(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: Boolean(user.emailVerifiedAt),
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      preferences: user.preferences,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const currentUser = await this.usersRepository.findById(userId);

    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    const data: {
      name?: string;
      email?: string;
      emailVerifiedAt?: Date | null;
    } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      if (name !== currentUser.name) {
        data.name = name;
      }
    }

    const normalizedEmail =
      dto.email !== undefined ? dto.email.trim().toLowerCase() : undefined;

    const emailChanged =
      normalizedEmail !== undefined && normalizedEmail !== currentUser.email;

    if (emailChanged) {
      const existingUser =
        await this.usersRepository.findByEmail(normalizedEmail);

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Email already registered');
      }

      data.email = normalizedEmail;
      data.emailVerifiedAt = null;
    }

    if (Object.keys(data).length === 0) {
      return this.getProfile(userId);
    }

    await this.usersRepository.updateUser(userId, data);

    if (emailChanged) {
      const updatedUser = await this.usersRepository.findById(userId);

      if (!updatedUser) {
        throw new NotFoundException('User not found');
      }

      await this.emailVerificationService.createAndSendToken(
        updatedUser.id,
        updatedUser.email,
        updatedUser.name,
      );
    }

    return this.getProfile(userId);
  }

  async getPreferences(userId: string) {
    const user = await this.usersRepository.findByIdWithPreference(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      currency: user.preferences?.currency,
      timezone: user.preferences?.timezone,
      locale: user.preferences?.locale,
      weekStartsOn: user.preferences?.weekStartsOn,
    };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const user = await this.usersRepository.findByIdWithPreference(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const data: {
      currency?: string;
      timezone?: string;
      locale?: string;
      weekStartsOn?: number;
    } = {};

    if (dto.currency !== undefined) {
      data.currency = dto.currency.trim().toUpperCase();
    }
    if (dto.timezone !== undefined) {
      data.timezone = dto.timezone.trim();
    }
    if (dto.locale !== undefined) {
      data.locale = dto.locale.trim();
    }
    if (dto.weekStartsOn !== undefined) {
      data.weekStartsOn = dto.weekStartsOn;
    }

    if (Object.keys(data).length === 0) {
      return this.getPreferences(userId);
    }

    await this.usersRepository.updatePreference(userId, data);

    return this.getPreferences(userId);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentPasswordMatches = await this.passwordService.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordMatchesCurrent = await this.passwordService.compare(
      dto.newPassword,
      user.passwordHash,
    );

    if (newPasswordMatchesCurrent) {
      throw new ConflictException(
        'New password must be different from current password',
      );
    }

    const newPasswordHash = await this.passwordService.hash(dto.newPassword);

    await this.usersRepository.updateUser(userId, {
      passwordHash: newPasswordHash,
    } as unknown as Parameters<UsersRepository['updateUser']>[1]);

    return {
      message: 'Password changed successfully',
    };
  }
}
