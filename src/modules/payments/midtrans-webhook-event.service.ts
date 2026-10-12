import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { MidtransWebhookSignatureService } from './midtrans-webhook-signature.service';
import { createHash } from 'node:crypto';
import { Prisma } from 'generated/prisma/client';

export interface ReceiveMidtransWebhookResult {
  status: 'received';
  duplicate: boolean;
  eventId: string;
}

@Injectable()
export class MidtransWebhookEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureService: MidtransWebhookSignatureService,
  ) {}

  async receive(notification: unknown): Promise<ReceiveMidtransWebhookResult> {
    const verified = this.signatureService.verify(notification);

    const eventId = createHash('sha256')
      .update(
        `${verified.order_id}\n${verified.status_code}\n${verified.gross_amount}`,
        'utf8',
      )
      .digest('hex');

    const payload = JSON.parse(
      JSON.stringify(notification),
    ) as Prisma.InputJsonValue;

    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider: 'MIDTRANS',
          eventId,
          eventType: 'transaction.notification',
          payload,
          status: 'RECEIVED',
        },
      });

      return {
        status: 'received',
        duplicate: false,
        eventId,
      };
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        return {
          status: 'received',
          duplicate: true,
          eventId,
        };
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
