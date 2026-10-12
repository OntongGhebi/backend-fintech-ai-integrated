import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PaymentCheckoutController } from './payment-checkout.controller';
import { PaymentCheckoutService } from './payment-checkout.service';
import { MidtransSnapGateway } from './midtrans-snap.gateway';
import { MidtransWebhookSignatureService } from './midtrans-webhook-signature.service';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentCheckoutController],
  providers: [
    PaymentCheckoutService,
    MidtransSnapGateway,
    MidtransWebhookSignatureService,
  ],
  exports: [PaymentCheckoutService, MidtransWebhookSignatureService],
})
export class PaymentCheckoutModule {}
