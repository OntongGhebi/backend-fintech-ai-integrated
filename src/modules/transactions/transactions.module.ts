import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from './repositories/transactions.repository';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionDomainService } from './transaction-domain.service';

@Module({
  imports: [AuthModule, AccountsModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsRepository,
    TransactionsService,
    TransactionDomainService,
  ],
  exports: [
    TransactionsRepository,
    TransactionsService,
    TransactionDomainService,
  ],
})
export class TransactionsModule {}
