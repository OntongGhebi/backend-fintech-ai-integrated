import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string) {
    return this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });
  }

  async findByIdWithPreference(userId: string) {
    return this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        preferences: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
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
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateUser(
    userId: string,
    data: {
      nama?: string;
      email?: string;
      emailVerifiedAt?: Date | null;
    },
  ) {
    return this.prisma.user.update({
      where: {
        id: userId,
      },
      data,
    });
  }

  async updatePreference(
    userId: string,
    data: {
      currency?: string;
      timezone?: string;
      locale?: string;
      weekStartsOn?: number;
    },
  ) {
    return this.prisma.userPreference.update({
      where: {
        userId,
      },
      data,
    });
  }

  async changePasswordAndRevokeSessions(
    userId: string,
    currentPasswordHash: string,
    newPasswordHash: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.updateMany({
        where: {
          id: userId,
          passwordHash: currentPasswordHash,
        },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      if (updatedUser.count !== 1) {
        return {
          passwordUpdated: false,
          sessionsRevoked: 0,
        };
      }

      const revokedSessions = await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return {
        passwordUpdated: true,
        sessionsRevoked: revokedSessions.count,
      };
    });
  }

  async findSessionsByUserId(userId: string) {
    return this.prisma.session.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async revokeSessionByIdAndUserId(
    sessionId: string,
    userId: string,
  ): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count;
  }

  async revokeAllSessionsByUserId(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count;
  }
}
