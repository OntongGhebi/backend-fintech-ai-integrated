import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  MidtransWebhookEventService,
  ReceiveMidtransWebhookResult,
} from './midtrans-webhook-event.service';

@ApiTags('Payments - Webhooks')
@Controller('payments/webhooks')
export class MidtransWebhookController {
  constructor(
    private readonly webhookEventService: MidtransWebhookEventService,
  ) {}

  @Post('midtrans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive and persist a Midtrans payment notification',
    description:
      'Verifies the Midtrans signature and persists the event idempotently. ' +
      'Payment status processing is handled separately.',
  })
  async receiveMidtransNotification(
    @Body() payload: unknown,
  ): Promise<ReceiveMidtransWebhookResult> {
    return this.webhookEventService.receive(payload);
  }
}
