import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { QueueService } from './queue.service';
import { SystemProcessor } from './processors/system.processor';
import { EmailProcessor } from './processors/email.processor';
import { EmailModule } from '../integrations/email/email.module';
import { RedisModule } from '../../docker/redis/redis.module';
import { RedisService } from '../../docker/redis/redis.service';

const isTestEnvironment = process.env.NODE_ENV === 'test';

class TestQueueService {
  async addTestJob(): Promise<void> {}

  async addEmailVerificationJob(): Promise<void> {}
}

@Module({
  imports: [
    EmailModule,
    RedisModule,
    ...(isTestEnvironment
      ? []
      : [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService, RedisService],
            useFactory: (
              configService: ConfigService,
              redisService: RedisService,
            ) => ({
              connection: redisService.getClient(),
              prefix: configService.get<string>('bullmq.prefix', 'fintech-ai'),
              defaultJobOptions: {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 5_000,
                },
                removeOnComplete: 100,
                removeOnFail: 1_000,
              },
            }),
          }),
          BullModule.registerQueue({ name: 'system' }, { name: 'email' }),
        ]),
  ],
  providers: isTestEnvironment
    ? [{ provide: QueueService, useClass: TestQueueService }]
    : [QueueService, SystemProcessor, EmailProcessor],
  exports: isTestEnvironment ? [QueueService] : [BullModule, QueueService],
})
export class QueueModule {}
