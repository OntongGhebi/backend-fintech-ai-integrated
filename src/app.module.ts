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
import aiConfig from './config/ai.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import databaseConfig from './config/database.config';
import { RequestMiddleware } from './common/middlewares/request-id.middleware';
import { RequestLoggerMiddleware } from './common/middlewares/request-logger.middleware';
import { RedisModule } from '../docker/redis/redis.module';
import bullmqConfig from './config/bullmq.config';
import { QueueModule } from './queue/queue.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { BudgetAlertsModule } from './modules/budget-alerts/budget-alerts.module';
import { RecurringTransactionsModule } from './modules/recurring-transactions/recurring-transactions.module';
import { telegramConfig } from './config/telegram.config';
import { telegramModule } from './modules/telegram/telegram.module';
import { AIModule } from './modules/ai/ai.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
      load: [
        appConfig,
        aiConfig,
        databaseConfig,
        redisConfig,
        jwtConfig,
        bullmqConfig,
        telegramConfig,
      ],
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
    AuthModule,
    UsersModule,
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    BudgetsModule,
    BudgetAlertsModule,
    RecurringTransactionsModule,
    telegramModule,
    AIModule,
    DashboardModule,
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
