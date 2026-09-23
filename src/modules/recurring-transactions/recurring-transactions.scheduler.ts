import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  RECURRING_TRANSACTIONS_JOB,
  RECURRING_TRANSACTIONS_QUEUE,
  RECURRING_TRANSACTIONS_SCHEDULE_INTERVAL_MS,
  RECURRING_TRANSACTIONS_SCHEDULER_ID,
} from './recurring-transactions.constants';

@Injectable()
export class RecurringTransactionsScheduler implements OnModuleInit {
  private readonly logger = new Logger(RecurringTransactionsScheduler.name);

  constructor(
    @InjectQueue(RECURRING_TRANSACTIONS_QUEUE)
    private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registerScheduler();
  }

  async registerScheduler(): Promise<void> {
    await this.queue.upsertJobScheduler(
      RECURRING_TRANSACTIONS_SCHEDULER_ID,
      {
        every: RECURRING_TRANSACTIONS_SCHEDULE_INTERVAL_MS,
      },
      {
        name: RECURRING_TRANSACTIONS_JOB,
        data: {},
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      },
    );

    this.logger.log(
      `Recurring transaction scheduler registered: every ${RECURRING_TRANSACTIONS_SCHEDULE_INTERVAL_MS}ms`,
    );
  }
}
