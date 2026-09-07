import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { SystemProcessor } from './processors/system.processor';
import { EmailProcessor } from './processors/email.processor';
import { EmailModule } from '../integrations/email/email.module';
// import { QueueController } from './queue.controller';

@Module({
  imports: [
    EmailModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password'),
          db: configService.get<number>('redis.db', 0),
        },
        prefix: configService.get<string>('bullmq.prefix', 'fintech-ai'),
      }),
    }),

    BullModule.registerQueue({ name: 'system' }, { name: 'email' }),
  ],
  providers: [QueueService, SystemProcessor, EmailProcessor],
  //   controllers: [QueueController],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
