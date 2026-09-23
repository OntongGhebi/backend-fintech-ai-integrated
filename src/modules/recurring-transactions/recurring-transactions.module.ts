import { Module } from '@nestjs/common';
import { RecurringTransactionsController } from './recurring-transactions.controller';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { RecurringTransactionsRepository } from './repositories/recurring-transactions.repository';
import { TransactionsModule } from '../transactions/transactions.module';
import { BullModule } from '@nestjs/bullmq';
import { RECURRING_TRANSACTIONS_QUEUE } from './recurring-transactions.constants';
import { RecurringTransactionsScheduler } from './recurring-transactions.scheduler';
import { RecurringTransactionsProcessor } from './recurring-transactions.processor';

@Module({
  imports: [
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    BullModule.registerQueue({
      name: RECURRING_TRANSACTIONS_QUEUE,
    }),
  ],
  controllers: [RecurringTransactionsController],
  providers: [
    RecurringTransactionsService,
    RecurringTransactionsRepository,
    RecurringTransactionsScheduler,
    RecurringTransactionsProcessor,
  ],
  exports: [
    RecurringTransactionsService,
    RecurringTransactionsRepository,
    RecurringTransactionsScheduler,
  ],
})
export class RecurringTransactionsModule {}
