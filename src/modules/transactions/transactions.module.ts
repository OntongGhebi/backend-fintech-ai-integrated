import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from './repositories/transactions.repository';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionDomainService } from './transaction-domain.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, AccountsModule, forwardRef(() => NotificationsModule)],
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
