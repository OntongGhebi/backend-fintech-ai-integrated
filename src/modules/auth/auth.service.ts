import { Injectable, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PasswordService } from './services/password.service';
import { RegisterDto } from './dto/register.dto';
import { EmailVerificationService } from './services/email-verification.service';
import { EmailService } from 'src/integrations/email/email.service';
import { QueueService } from 'src/queue/queue.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
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
}
