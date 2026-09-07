/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { QueueService } from '../../../queue/queue.service';

@Injectable()
export class EmailVerificationService {
  private readonly tokenExpirationMinutes = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
  ) {}

  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createToken(userId: string): Promise<string> {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);

    const expiresAt = new Date(
      Date.now() + this.tokenExpirationMinutes * 60 * 1000,
    );

    await this.prisma.emailVerificationToken.deleteMany({
      where: {
        userId,
        usedAt: null,
      },
    });

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return token;
  }

  async createAndSendToken(
    userId: string,
    email: string,
    name: string,
  ): Promise<void> {
    const token = await this.createToken(userId);

    const frontendUrl = this.configService.get<string>('app.frontendUrl');

    if (!frontendUrl) {
      throw new Error('FRONTEND_URL is not configured');
    }

    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;

    await this.queueService.addEmailVerificationJob({
      email,
      name,
      verificationUrl,
    });
  }

  async verifyToken(token: string): Promise<string> {
    const tokenHash = this.hashToken(token);

    const verificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: {
          tokenHash,
        },
      });

    if (!verificationToken) {
      throw new NotFoundException('Invalid or expired token');
    }

    if (verificationToken.usedAt) {
      throw new ConflictException('Verification token has already been used');
    }

    if (verificationToken.expiresAt < new Date()) {
      throw new ConflictException('Verification token has expired');
    }
    return verificationToken.userId;
  }

  async markAsUsed(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    await this.prisma.emailVerificationToken.update({
      where: {
        tokenHash,
      },
      data: {
        usedAt: new Date(),
      },
    });
  }
  async verifyEmail(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    await this.prisma.$transaction(
      async (tx) => {
        const verificationToken = await tx.emailVerificationToken.findUnique({
          where: {
            tokenHash,
          },
        });

        if (!verificationToken) {
          throw new NotFoundException('Invalid verification token');
        }

        if (verificationToken.usedAt) {
          throw new ConflictException(
            'Verification token has already been used',
          );
        }

        if (verificationToken.expiresAt <= new Date()) {
          throw new ConflictException('Verification token has expired');
        }

        const updated = await tx.emailVerificationToken.updateMany({
          where: {
            id: verificationToken.id,
            usedAt: null,
          },
          data: {
            usedAt: new Date(),
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Verification token has already been used',
          );
        }

        await tx.user.update({
          where: {
            id: verificationToken.userId,
          },
          data: {
            emailVerifiedAt: new Date(),
          },
        });
      },
      {
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  }
}
