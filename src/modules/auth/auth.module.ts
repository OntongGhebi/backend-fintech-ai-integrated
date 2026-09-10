import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';

import { QueueModule } from 'src/queue/queue.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

import { PasswordService } from './services/password.service';
import { EmailVerificationService } from './services/email-verification.service';

import { AccessTokenGuard } from './guards/access-token.guard';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { RefreshTokenService } from './services/refresh-token.service';

@Module({
  imports: [
    ConfigModule,
    QueueModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = (configService.get<string>('jwt.accessExpiresIn') ??
          '15m') as JwtSignOptions['expiresIn'];

        return {
          secret: configService.getOrThrow<string>('jwt.accessSecret'),
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    EmailVerificationService,
    RefreshTokenService,
    AccessTokenStrategy,
    AccessTokenGuard,
  ],
  exports: [
    AuthService,
    PasswordService,
    EmailVerificationService,
    AccessTokenGuard,
  ],
})
export class AuthModule {}
