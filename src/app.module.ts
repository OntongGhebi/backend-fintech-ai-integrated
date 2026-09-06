import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
// import { DatabaseModule } from './database/database.module';
import { validateEnvironment } from './config/env.validation';
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import databaseConfig from './config/database.config';
import { RequestMiddleware } from './common/middlewares/request-id.middleware';
import { RequestLoggerMiddleware } from './common/middlewares/request-logger.middleware';
import { RedisModule } from 'docker/redis/redis.module';
import bullmqConfig from './config/bullmq.config';
import { QueueModule } from './queue/queue.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig, bullmqConfig],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),

    DatabaseModule,
    RedisModule,
    QueueModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestMiddleware, RequestLoggerMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
