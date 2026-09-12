import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AuthModule } from '../auth/auth.module';
import { AccountsRepository } from './repositories/accounts.repository';

@Module({
  imports: [AuthModule],
  controllers: [AccountsController],
  providers: [AccountsRepository, AccountsService],
  exports: [AccountsService, AccountsRepository],
})
export class AccountsModule {}
