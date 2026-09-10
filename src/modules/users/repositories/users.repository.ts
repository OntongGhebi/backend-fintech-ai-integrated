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

  async revokeAllSessions(userId: string) {
    return this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
