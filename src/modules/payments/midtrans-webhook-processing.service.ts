import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PaymentStatus,
  Prisma,
  SubscriptionEventType,
  SubscriptionStatus,
  WebhookEventStatus,
} from '../../../generated/prisma/client.js';

import { PrismaService } from 'src/database/prisma/prisma.service';

type PaymentWithSubscription = Prisma.PaymentGetPayload<{
  include: {
    subscription: true;
  };
}>;

type TransactionClient = Prisma.TransactionClient;

interface MidtransPayload {
  order_id: string;
  gross_amount: string;
  transaction_status: string;
  transaction_id?: string;
  fraud_status?: string;
}

export type ProcessMidtransWebhookResult =
  | {
      status: 'processed';
      eventId: string;
    }
  | {
      status: 'already_processed';
      eventId: string;
    }
  | {
      status: 'already_processing';
      eventId: string;
    };

@Injectable()
export class MidtransWebhookProcessingService {
  constructor(private readonly prisma: PrismaService) {}

  async process(eventId: string): Promise<ProcessMidtransWebhookResult> {
    let processingStarted = false;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await tx.webhookEvent.findUnique({
          where: {
            provider_eventId: {
              provider: 'MIDTRANS',
              eventId,
            },
          },
        });

        if (!event) {
          throw new NotFoundException('Webhook event not found.');
        }

        if (event.status === WebhookEventStatus.PROCESSED) {
          return {
            status: 'already_processed',
            eventId,
          };
        }

        if (event.status === WebhookEventStatus.PROCESSING) {
          return {
            status: 'already_processing',
            eventId,
          };
        }

        const claim = await tx.webhookEvent.updateMany({
          where: {
            id: event.id,
            status: {
              in: [WebhookEventStatus.RECEIVED, WebhookEventStatus.FAILED],
            },
          },
          data: {
            status: WebhookEventStatus.PROCESSING,
          },
        });

        if (claim.count === 0) {
          const latestEvent = await tx.webhookEvent.findUnique({
            where: {
              id: event.id,
            },
          });

          if (latestEvent?.status === WebhookEventStatus.PROCESSED) {
            return {
              status: 'already_processed',
              eventId,
            };
          }

          return {
            status: 'already_processing',
            eventId,
          };
        }

        processingStarted = true;

        const payload = this.parsePayload(event.payload);

        if (!this.isUuid(payload.order_id)) {
          throw new BadRequestException(
            'Midtrans order_id is not a valid payment UUID.',
          );
        }

        const payment = await tx.payment.findUnique({
          where: {
            id: payload.order_id,
          },
          include: {
            subscription: true,
          },
        });

        if (!payment || payment.provider !== 'MIDTRANS') {
          throw new NotFoundException(
            'Payment for this Midtrans order was not found.',
          );
        }

        if (payment.currency !== 'IDR') {
          throw new BadRequestException('Only IDR payments are supported.');
        }

        if (
          this.toMinorUnits(payment.amount.toFixed(2)) !==
          this.toMinorUnits(payload.gross_amount)
        ) {
          throw new BadRequestException(
            'Midtrans gross_amount does not match the payment amount.',
          );
        }

        const now = new Date();
        const transactionStatus = payload.transaction_status.toLowerCase();

        const providerPaymentId = payload.transaction_id?.trim() || null;

        switch (transactionStatus) {
          case 'settlement':
            await this.applySuccessfulPayment(
              tx,
              payment,
              providerPaymentId,
              now,
            );
            break;

          case 'capture':
            if (payload.fraud_status?.toLowerCase() === 'accept') {
              await this.applySuccessfulPayment(
                tx,
                payment,
                providerPaymentId,
                now,
              );
            }

            // A capture without an accepted fraud status is not
            // considered a successful payment.
            break;

          case 'pending':
            // Keep the payment pending. A later event may settle it.
            break;

          case 'deny':
          case 'expire':
            await this.applyFailedPayment(tx, payment, providerPaymentId, now);
            break;

          case 'cancel':
            await this.applyCanceledPayment(
              tx,
              payment,
              providerPaymentId,
              now,
            );
            break;

          case 'refund':
            await this.applyRefund(tx, payment, providerPaymentId);
            break;

          case 'partial_refund':
            // The current schema has no partial-refund status.
            // Do not incorrectly mark a partially refunded payment
            // as fully refunded.
            break;

          default:
            throw new BadRequestException(
              `Unsupported Midtrans transaction_status: ${transactionStatus}`,
            );
        }

        await tx.webhookEvent.update({
          where: {
            id: event.id,
          },
          data: {
            status: WebhookEventStatus.PROCESSED,
            processedAt: now,
          },
        });

        return {
          status: 'processed',
          eventId,
        };
      });
    } catch (error: unknown) {
      /*
       * If the processing transaction fails, its PROCESSING update
       * is rolled back. Mark the event FAILED outside that transaction
       * so it can be investigated or retried.
       *
       * Never overwrite an event that another transaction has already
       * completed successfully.
       */
      if (processingStarted) {
        try {
          await this.prisma.webhookEvent.updateMany({
            where: {
              provider: 'MIDTRANS',
              eventId,
              status: {
                in: [
                  WebhookEventStatus.RECEIVED,
                  WebhookEventStatus.PROCESSING,
                  WebhookEventStatus.FAILED,
                ],
              },
            },
            data: {
              status: WebhookEventStatus.FAILED,
            },
          });
        } catch {
          // Preserve the original processing error.
          // If the database is unavailable, the failure status may
          // require reconciliation after database recovery.
        }
      }

      throw error;
    }
  }

  private async applySuccessfulPayment(
    tx: TransactionClient,
    payment: PaymentWithSubscription,
    providerPaymentId: string | null,
    now: Date,
  ): Promise<void> {
    // A refunded payment must never be restored by a late event.
    if (payment.status === PaymentStatus.REFUNDED) {
      return;
    }

    /*
     * Multiple successful notifications can refer to the same payment.
     * Once PAID, never extend the subscription a second time.
     */
    if (payment.status === PaymentStatus.PAID) {
      if (providerPaymentId && !payment.providerPaymentId) {
        await tx.payment.update({
          where: {
            id: payment.id,
          },
          data: {
            providerPaymentId,
          },
        });
      }

      return;
    }

    await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: PaymentStatus.PAID,
        providerPaymentId: providerPaymentId ?? payment.providerPaymentId,
        paidAt: now,
        failedAt: null,
      },
    });

    const subscription = payment.subscription;

    /*
     * A late successful payment must not silently reactivate a
     * subscription that was canceled, expired, or paused meanwhile.
     * The payment is recorded as PAID for reconciliation, but access
     * remains unchanged.
     */
    const canActivateSubscription =
      subscription.status === SubscriptionStatus.TRIALING ||
      subscription.status === SubscriptionStatus.ACTIVE;

    if (!canActivateSubscription) {
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: SubscriptionEventType.RENEWED,
          oldStatus: subscription.status,
          newStatus: subscription.status,
          metadata: {
            source: 'MIDTRANS_WEBHOOK',
            paymentId: payment.id,
            providerPaymentId,
            subscriptionActivationSkipped: true,
            reason: 'Subscription was not eligible for automatic reactivation.',
          },
        },
      });

      return;
    }

    /*
     * For an active subscription with an unexpired period, extend
     * from currentPeriodEnd. Otherwise start the new period from now.
     */
    const periodStart =
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd > now
        ? subscription.currentPeriodEnd
        : now;

    const periodEnd = this.calculatePeriodEnd(
      periodStart,
      subscription.billingInterval,
    );

    const oldStatus = subscription.status;

    await tx.subscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        provider: 'MIDTRANS',
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        eventType:
          oldStatus === SubscriptionStatus.ACTIVE
            ? SubscriptionEventType.RENEWED
            : SubscriptionEventType.SUBSCRIBED,
        oldStatus,
        newStatus: SubscriptionStatus.ACTIVE,
        metadata: {
          source: 'MIDTRANS_WEBHOOK',
          paymentId: payment.id,
          providerPaymentId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      },
    });
  }

  private async applyFailedPayment(
    tx: TransactionClient,
    payment: PaymentWithSubscription,
    providerPaymentId: string | null,
    now: Date,
  ): Promise<void> {
    // Do not downgrade payments that have already reached a final state.
    if (payment.status !== PaymentStatus.PENDING) {
      return;
    }

    await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: PaymentStatus.FAILED,
        providerPaymentId: providerPaymentId ?? payment.providerPaymentId,
        failedAt: now,
      },
    });

    /*
     * A failed checkout does not automatically make an existing
     * active subscription past due. This checkout flow can be used
     * while the subscription is active or in trial.
     */
  }

  private async applyCanceledPayment(
    tx: TransactionClient,
    payment: PaymentWithSubscription,
    providerPaymentId: string | null,
    now: Date,
  ): Promise<void> {
    if (payment.status !== PaymentStatus.PENDING) {
      return;
    }

    await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: PaymentStatus.CANCELED,
        providerPaymentId: providerPaymentId ?? payment.providerPaymentId,
        failedAt: now,
      },
    });
  }

  private async applyRefund(
    tx: TransactionClient,
    payment: PaymentWithSubscription,
    providerPaymentId: string | null,
  ): Promise<void> {
    if (payment.status !== PaymentStatus.PAID) {
      return;
    }

    await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: PaymentStatus.REFUNDED,
        providerPaymentId: providerPaymentId ?? payment.providerPaymentId,
      },
    });

    /*
     * Subscription access after a refund is a product policy decision.
     * The current schema does not express partial refunds, so this
     * method does not automatically cancel the subscription.
     */
  }

  private parsePayload(payload: unknown): MidtransPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new BadRequestException('Invalid stored webhook payload.');
    }

    const value = payload as Record<string, unknown>;

    if (
      typeof value.order_id !== 'string' ||
      value.order_id.trim().length === 0 ||
      typeof value.gross_amount !== 'string' ||
      typeof value.transaction_status !== 'string' ||
      value.transaction_status.trim().length === 0 ||
      (value.transaction_id !== undefined &&
        value.transaction_id !== null &&
        typeof value.transaction_id !== 'string') ||
      (value.fraud_status !== undefined &&
        typeof value.fraud_status !== 'string')
    ) {
      throw new BadRequestException(
        'Stored Midtrans payload is missing required fields.',
      );
    }

    return value as unknown as MidtransPayload;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  /**
   * Convert a monetary value to integer cents without floating-point
   * arithmetic. Midtrans gross_amount is represented as a decimal string.
   */
  private toMinorUnits(value: string): bigint {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);

    if (!match) {
      throw new BadRequestException(
        'Invalid monetary amount in Midtrans notification.',
      );
    }

    const whole = BigInt(match[1]);
    const fraction = BigInt((match[2] ?? '').padEnd(2, '0'));

    return whole * 100n + fraction;
  }

  private calculatePeriodEnd(start: Date, interval: string): Date {
    const end = new Date(start);
    const originalDay = end.getUTCDate();

    // Move to the first day to avoid month-end rollover errors.
    end.setUTCDate(1);

    if (interval === 'MONTHLY') {
      end.setUTCMonth(end.getUTCMonth() + 1);
    } else if (interval === 'YEARLY') {
      end.setUTCFullYear(end.getUTCFullYear() + 1);
    } else {
      throw new BadRequestException(
        'Unsupported subscription billing interval.',
      );
    }

    const lastDayOfMonth = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
    ).getUTCDate();

    end.setUTCDate(Math.min(originalDay, lastDayOfMonth));

    return end;
  }
}
