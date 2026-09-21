import { Module } from '@nestjs/common';
import { RecurringTransactionsController } from './recurring-transactions.controller';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { RecurringTransactionsRepository } from './repositories/recurring-transactions.repository';

@Module({
  imports: [AccountsModule, CategoriesModule],
  controllers: [RecurringTransactionsController],
  providers: [RecurringTransactionsService, RecurringTransactionsRepository],
  exports: [RecurringTransactionsService, RecurringTransactionsRepository],
})
export class RecurringTransactionsModule {}
