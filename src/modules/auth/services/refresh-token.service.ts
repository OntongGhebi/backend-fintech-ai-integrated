import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';

import { PrismaService } from '../../../database/prisma/prisma.service';
import { RefreshTokenPayload } from '../types/refresh-token-payload.type';

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<string> {
    const sessionId = randomUUID();

    const refreshToken = await this.generateRefreshToken(userId, sessionId);

    const refreshTokenHash = this.hashToken(refreshToken);

    const expiresAt = this.getRefreshTokenExpiration(refreshToken);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash,
        expiresAt,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return refreshToken;
  }

  async rotateSession(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const session = await this.prisma.session.findUnique({
      where: {
        id: payload.sid,
      },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const incomingTokenHash = this.hashToken(refreshToken);

    if (incomingTokenHash !== session.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    const newRefreshToken = await this.generateRefreshToken(
      session.userId,
      session.id,
    );

    const newRefreshTokenHash = this.hashToken(newRefreshToken);

    const newExpiresAt = this.getRefreshTokenExpiration(newRefreshToken);

    await this.prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newExpiresAt,
        lastUsedAt: new Date(),
      },
    });

    const accessToken = await this.generateAccessToken(session.userId);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.userId !== userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      return;
    }

    await this.prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async revokeSessionByRefreshToken(
    refreshToken: string,
    userId: string,
  ): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (payload.sub !== userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.revokeSession(payload.sid, userId);
  }

  private async generateAccessToken(userId: string): Promise<string> {
    const accessSecret = this.configService.get<string>('jwt.accessSecret');

    const accessExpiresIn = this.configService.get<string>(
      'jwt.accessExpiresIn',
    ) as JwtSignOptions['expiresIn'];

    if (!accessSecret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }

    if (!accessExpiresIn) {
      throw new Error('JWT_ACCESS_EXPIRES_IN is not configured');
    }

    return this.jwtService.signAsync(
      {
        sub: userId,
      },
      {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      },
    );
  }

  private async generateRefreshToken(
    userId: string,
    sessionId: string,
  ): Promise<string> {
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');

    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
    ) as JwtSignOptions['expiresIn'];

    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    if (!refreshExpiresIn) {
      throw new Error('JWT_REFRESH_EXPIRES_IN is not configured');
    }

    const payload: RefreshTokenPayload = {
      sub: userId,
      sid: sessionId,
    };

    return this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn,
    });
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenPayload> {
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');

    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: refreshSecret,
        },
      );

      if (!payload?.sub || !payload?.sid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getRefreshTokenExpiration(refreshToken: string): Date {
    const decoded = this.jwtService.decode(refreshToken) as {
      exp?: unknown;
    } | null;

    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof decoded.exp !== 'number'
    ) {
      throw new Error('Refresh token does not contain an expiration time');
    }

    return new Date(decoded.exp * 1000);
  }
}
