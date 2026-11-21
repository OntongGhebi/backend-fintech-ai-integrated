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
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const sessionId = randomUUID();

    const refreshToken = await this.generateRefreshToken(userId, sessionId);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: this.getRefreshTokenExpiration(refreshToken),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return {
      sessionId,
      refreshToken,
    };
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
            deletedAt: true,
          },
        },
      },
    });

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    if (
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt !== null
    ) {
      throw new UnauthorizedException('User account is not active');
    }

    const incomingTokenHash = this.hashToken(refreshToken);

    if (incomingTokenHash !== session.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newRefreshToken = await this.generateRefreshToken(
      session.userId,
      session.id,
    );

    const newRefreshTokenHash = this.hashToken(newRefreshToken);
    const newExpiresAt = this.getRefreshTokenExpiration(newRefreshToken);

    const updateResult = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        userId: session.userId,
        refreshTokenHash: incomingTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newExpiresAt,
        lastUsedAt: new Date(),
      },
    });

    if (updateResult.count !== 1) {
      throw new UnauthorizedException(
        'Refresh token has already been rotated or revoked',
      );
    }

    const accessToken = await this.generateAccessToken(
      session.userId,
      session.id,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count > 1) {
      throw new Error(
        'Session revocation affected an unexpected number of records',
      );
    }

    if (result.count === 0) {
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

      if (!session || session.userId !== userId) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (session.revokedAt) {
        return;
      }

      throw new UnauthorizedException(
        'Unable to revoke authentication session',
      );
    }
  }

  async revokeSessionByRefreshToken(
    refreshToken: string,
    userId: string,
    expectedSessionId: string,
  ): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (
      payload.sub !== userId ||
      payload.sid !== expectedSessionId
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const incomingTokenHash = this.hashToken(refreshToken);

    const result = await this.prisma.session.updateMany({
      where: {
        id: expectedSessionId,
        userId,
        refreshTokenHash: incomingTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateAccessToken(
    userId: string,
    sessionId: string,
  ): Promise<string> {
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
        sid: sessionId,
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
      jti: randomUUID(),
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
          algorithms: ['HS256'],
        },
      );

      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.sub !== 'string' ||
        payload.sub.trim().length === 0 ||
        typeof payload.sid !== 'string' ||
        payload.sid.trim().length === 0 ||
        typeof payload.jti !== 'string' ||
        payload.jti.trim().length === 0
      ) {
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
    const decoded = this.jwtService.decode<{ exp?: unknown }>(refreshToken);

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