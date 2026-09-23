import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import {
  RECURRING_TRANSACTIONS_JOB,
  RECURRING_TRANSACTIONS_QUEUE,
} from './recurring-transactions.constants';
import { RecurringTransactionsRepository } from './repositories/recurring-transactions.repository';
import { RecurringTransactionsService } from './recurring-transactions.service';

@Processor(RECURRING_TRANSACTIONS_QUEUE)
export class RecurringTransactionsProcessor extends WorkerHost {
  private readonly logger = new Logger(RecurringTransactionsProcessor.name);

  constructor(
    private readonly repository: RecurringTransactionsRepository,
    private readonly recurringTransactionsService: RecurringTransactionsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== RECURRING_TRANSACTIONS_JOB) {
      this.logger.warn(`Unknown recurring transaction job: ${job.name}`);

      return;
    }

    const now = new Date();

    const dueTransactions = await this.repository.findManyDue(now);

    this.logger.log(
      `Found ${dueTransactions.length} due recurring transaction(s)`,
    );

    for (const recurringTransaction of dueTransactions) {
      try {
        const result = await this.recurringTransactionsService.execute(
          recurringTransaction.userId,
          recurringTransaction.id,
        );

        if (result.alreadyExecuted) {
          this.logger.debug(
            `Recurring transaction ${recurringTransaction.id} was already executed`,
          );

          continue;
        }

        this.logger.log(
          `Recurring transaction ${recurringTransaction.id} executed successfully`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to execute recurring transaction ${recurringTransaction.id}`,
          error instanceof Error ? error.stack : String(error),
        );

        throw error;
      }
    }
  }
}
