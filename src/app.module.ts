import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { validateEnvironment } from './config/env.validation';
import appConfig from './config/app.config';
import aiConfig from './config/ai.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import databaseConfig from './config/database.config';
import bullmqConfig from './config/bullmq.config';
import { telegramConfig } from './config/telegram.config';

import { RequestMiddleware } from './common/middlewares/request-id.middleware';
import { RequestLoggerMiddleware } from './common/middlewares/request-logger.middleware';
import { RedisThrottlerStorage } from './common/guards/redis-throttler.storage';

import { RedisModule } from '../docker/redis/redis.module';
import { RedisService } from '../docker/redis/redis.service';

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
import { telegramModule } from './modules/telegram/telegram.module';
import { AIModule } from './modules/ai/ai.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PaymentCheckoutModule } from './modules/payments/payment-checkout.module';
import { FinancialAnalysisModule } from './modules/financial-analysis/financial-analysis.module';

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

    RedisModule,

    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 100,
          },
        ],
        storage: new RedisThrottlerStorage(redisService),
      }),
    }),

    DatabaseModule,
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
    ReportsModule,
    NotificationsModule,

    FinancialAnalysisModule,

    PlansModule,
    SubscriptionsModule,
    PaymentsModule,
    PaymentCheckoutModule,
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
