import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { NotificationEventsService } from 'src/modules/notifications/notification-events.service';

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
    private readonly notificationEventsService: NotificationEventsService,
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

        if (!result.transaction) {
          this.logger.warn(
            `Recurring transaction ${recurringTransaction.id} returned no transaction record; notification skipped.`,
          );
          continue;
        }

        try {
          await this.notificationEventsService.recurringTransactionExecuted({
            userId: recurringTransaction.userId,
            recurringTransactionId: recurringTransaction.id,
            transactionId: result.transaction.id,
            transactionType: String(result.transaction.type),
            amount: String(result.transaction.amount),
            description: result.transaction.description ?? null,
          });
        } catch (notificationError) {
          this.logger.error(
            `Recurring transaction ${recurringTransaction.id} completed, but its notification event failed.`,
            notificationError instanceof Error
              ? notificationError.stack
              : String(notificationError),
          );
        }
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
