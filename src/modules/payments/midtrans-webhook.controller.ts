import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MidtransWebhookEventService } from './midtrans-webhook-event.service';
import { MidtransWebhookProcessingService } from './midtrans-webhook-processing.service';

@ApiTags('Payments - Webhooks')
@Controller('payments/webhooks')
export class MidtransWebhookController {
  constructor(
    private readonly webhookEventService: MidtransWebhookEventService,
    private readonly webhookProcessingService: MidtransWebhookProcessingService,
  ) {}

  @Post('midtrans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive and process a Midtrans payment notification',
    description:
      'Verifies the signature, persists the event idempotently, and ' +
      'processes the payment/subscription update transactionally.',
  })
  @ApiBody({
    description:
      'Midtrans notification payload. signature_key is SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY); calculate it locally and do not expose the server key.',
    schema: {
      type: 'object',
      required: [
        'order_id',
        'status_code',
        'gross_amount',
        'signature_key',
        'transaction_status',
      ],
      properties: {
        order_id: {
          type: 'string',
          example: '00000000-0000-4000-8000-000000000000',
        },
        status_code: { type: 'string', example: '200' },
        gross_amount: { type: 'string', example: '99000.00' },
        signature_key: {
          type: 'string',
          example: '<128-character-sha512-signature>',
        },
        transaction_id: {
          type: 'string',
          example: 'midtrans-transaction-123',
        },
        transaction_status: { type: 'string', example: 'settlement' },
        fraud_status: { type: 'string', example: 'accept' },
      },
    },
  })
  async receiveMidtransNotification(@Body() payload: unknown) {
    const received = await this.webhookEventService.receive(payload);

    const processing = await this.webhookProcessingService.process(
      received.eventId,
    );

    return {
      ...received,
      processing,
    };
  }
}
