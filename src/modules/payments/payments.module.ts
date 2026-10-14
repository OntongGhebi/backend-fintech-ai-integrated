import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './repositories/payments.repository';
import { BillingHistoryService } from './billing-history.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository, BillingHistoryService],
  exports: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
