import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

import { EmailVerificationService } from './services/email-verification.service';
import { PasswordService } from './services/password.service';

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
  ) {}

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();
    const name = registerDto.name.trim();

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.passwordService.hash(registerDto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
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

      await tx.userPreference.create({
        data: {
          userId: createdUser.id,
        },
      });

      return createdUser;
    });

    const verificationToken = await this.emailVerificationService.createToken(
      user.id,
    );

    const frontendUrl = this.configService.get<string>('app.frontendUrl');

    if (!frontendUrl) {
      throw new Error('FRONTEND_URL is not configured');
    }

    const verificationUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;

    await this.queueService.addEmailVerificationJob({
      email: user.email,
      name: user.name,
      verificationUrl,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }

  async login(loginDto: LoginDto) {
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

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
      },
    };
  }
}
