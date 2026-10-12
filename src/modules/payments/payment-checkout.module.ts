import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PaymentCheckoutController } from './payment-checkout.controller';
import { PaymentCheckoutService } from './payment-checkout.service';
import { MidtransSnapGateway } from './midtrans-snap.gateway';
import { MidtransWebhookSignatureService } from './midtrans-webhook-signature.service';
import { MidtransWebhookController } from './midtrans-webhook.controller';
import { MidtransWebhookEventService } from './midtrans-webhook-event.service';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentCheckoutController, MidtransWebhookController],
  providers: [
    PaymentCheckoutService,
    MidtransSnapGateway,
    MidtransWebhookSignatureService,
    MidtransWebhookEventService,
  ],
  exports: [
    PaymentCheckoutService,
    MidtransWebhookSignatureService,
    MidtransWebhookEventService,
  ],
})
export class PaymentCheckoutModule {}
