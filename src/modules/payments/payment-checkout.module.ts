import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PaymentCheckoutController } from './payment-checkout.controller';
import { PaymentCheckoutService } from './payment-checkout.service';
import { MidtransSnapGateway } from './midtrans-snap.gateway';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentCheckoutController],
  providers: [PaymentCheckoutService, MidtransSnapGateway],
  exports: [PaymentCheckoutService],
})
export class PaymentCheckoutModule {}
