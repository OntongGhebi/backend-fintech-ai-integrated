import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';

import { PrismaService } from '../../database/prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordService } from './services/password.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          email,
          passwordHash,
          name,
        },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerifiedAt: true,
        },
      });

      await transaction.userPreference.create({
        data: {
          userId: createdUser.id,
        },
      });

      return createdUser;
    });

    await this.emailVerificationService.createAndSendToken(
      user.id,
      user.email,
      user.name,
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: Boolean(user.emailVerifiedAt),
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const email = loginDto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        name: true,
        emailVerifiedAt: true,
        status: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.passwordService.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Email address is not verified');
    }

    const payload: JwtPayload = {
      sub: user.id,
    };

    const accessSecret =
      this.configService.getOrThrow<string>('jwt.accessSecret');

    const accessExpiresIn = this.configService.getOrThrow<string>(
      'jwt.accessExpiresIn',
    ) as JwtSignOptions['expiresIn'];

    const jwtOptions: JwtSignOptions = {
      secret: accessSecret,
      expiresIn: accessExpiresIn,
    };

    const accessToken = await this.jwtService.signAsync(payload, jwtOptions);

    const refreshToken = await this.refreshTokenService.createSession(
      user.id,
      ipAddress,
      userAgent,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
      },
    };
  }

  async refresh(refreshToken: string) {
    return this.refreshTokenService.rotateSession(refreshToken);
  }

  async logout(
    refreshToken: string,
    userId: string,
  ): Promise<{ message: string }> {
    await this.refreshTokenService.revokeSessionByRefreshToken(
      refreshToken,
      userId,
    );

    return {
      message: 'Logout successfully',
    };
  }
}
