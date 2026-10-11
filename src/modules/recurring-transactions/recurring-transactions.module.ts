import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';

import { RecurringTransactionsController } from './recurring-transactions.controller';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { RecurringTransactionsRepository } from './repositories/recurring-transactions.repository';

import { RECURRING_TRANSACTIONS_QUEUE } from './recurring-transactions.constants';
import { RecurringTransactionsScheduler } from './recurring-transactions.scheduler';
import { RecurringTransactionsProcessor } from './recurring-transactions.processor';
import { NotificationsModule } from '../notifications/notifications.module';

const isTestEnvironment = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    NotificationsModule,

    ...(isTestEnvironment
      ? []
      : [
          BullModule.registerQueue({
            name: RECURRING_TRANSACTIONS_QUEUE,
          }),
        ]),
  ],

  controllers: [RecurringTransactionsController],

  providers: [
    RecurringTransactionsService,
    RecurringTransactionsRepository,

    ...(isTestEnvironment
      ? []
      : [RecurringTransactionsScheduler, RecurringTransactionsProcessor]),
  ],

  exports: [
    RecurringTransactionsService,
    RecurringTransactionsRepository,

    ...(isTestEnvironment ? [] : [RecurringTransactionsScheduler]),
  ],
})
export class RecurringTransactionsModule {}
