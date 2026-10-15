import { BadRequestException } from '@nestjs/common';

import {
  PaymentStatus,
  SubscriptionEventType,
  SubscriptionStatus,
  WebhookEventStatus,
} from '../../../generated/prisma/client.js';

import { PrismaService } from 'src/database/prisma/prisma.service';

import { MidtransWebhookProcessingService } from './midtrans-webhook-processing.service';

describe('MidtransWebhookProcessingService', () => {
  let service: MidtransWebhookProcessingService;

  const paymentId = '550e8400-e29b-41d4-a716-446655440000';
  const subscriptionId = '550e8400-e29b-41d4-a716-446655440001';
  const eventId = 'a'.repeat(64);

  const makeEvent = (overrides: Record<string, unknown> = {}) => ({
    id: 'webhook-event-id',
    provider: 'MIDTRANS',
    eventId,
    status: WebhookEventStatus.RECEIVED,
    payload: {
      order_id: paymentId,
      gross_amount: '99000.00',
      transaction_status: 'settlement',
      transaction_id: 'midtrans-transaction-id',
      fraud_status: 'accept',
    },
    ...overrides,
  });

  const makePayment = (overrides: Record<string, any> = {}) => ({
    id: paymentId,
    userId: 'user-id',
    subscriptionId,
    amount: {
      toFixed: jest.fn().mockReturnValue('99000.00'),
    },
    currency: 'IDR',
    status: PaymentStatus.PENDING,
    provider: 'MIDTRANS',
    providerPaymentId: paymentId,
    paidAt: null,
    failedAt: null,
    subscription: {
      id: subscriptionId,
      userId: 'user-id',
      planId: 'plan-id',
      status: SubscriptionStatus.TRIALING,
      billingInterval: 'MONTHLY',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      provider: null,
    },
    ...overrides,
  });

  const txMock = {
    webhookEvent: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      update: jest.fn(),
    },
    subscriptionEvent: {
      create: jest.fn(),
    },
  };

  const prismaMock = {
    $transaction: jest.fn(),
    webhookEvent: {
      updateMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    txMock.webhookEvent.findUnique.mockResolvedValue(makeEvent());
    txMock.webhookEvent.updateMany.mockResolvedValue({ count: 1 });
    txMock.webhookEvent.update.mockResolvedValue({});
    txMock.payment.findUnique.mockResolvedValue(makePayment());
    txMock.payment.update.mockResolvedValue({});
    txMock.subscription.update.mockResolvedValue({});
    txMock.subscriptionEvent.create.mockResolvedValue({});

    prismaMock.webhookEvent.updateMany.mockResolvedValue({ count: 1 });

    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock),
    );

    service = new MidtransWebhookProcessingService(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('event state handling', () => {
    it('returns already_processed without applying payment changes', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(
        makeEvent({
          status: WebhookEventStatus.PROCESSED,
        }),
      );

      const result = await service.process(eventId);

      expect(result).toEqual({
        status: 'already_processed',
        eventId,
      });

      expect(txMock.webhookEvent.updateMany).not.toHaveBeenCalled();
      expect(txMock.payment.findUnique).not.toHaveBeenCalled();
      expect(txMock.payment.update).not.toHaveBeenCalled();
    });

    it('returns already_processing when the event is processing', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(
        makeEvent({
          status: WebhookEventStatus.PROCESSING,
        }),
      );

      const result = await service.process(eventId);

      expect(result).toEqual({
        status: 'already_processing',
        eventId,
      });

      expect(txMock.webhookEvent.updateMany).not.toHaveBeenCalled();
      expect(txMock.payment.findUnique).not.toHaveBeenCalled();
    });

    it('throws when the webhook event does not exist', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(null);

      await expect(service.process(eventId)).rejects.toThrow(
        'Webhook event not found.',
      );

      expect(txMock.payment.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.webhookEvent.updateMany).not.toHaveBeenCalled();
    });

    it('returns already_processed if another worker claims the event first', async () => {
      txMock.webhookEvent.updateMany.mockResolvedValueOnce({ count: 0 });

      txMock.webhookEvent.findUnique
        .mockResolvedValueOnce(makeEvent())
        .mockResolvedValueOnce(
          makeEvent({
            status: WebhookEventStatus.PROCESSED,
          }),
        );

      const result = await service.process(eventId);

      expect(result).toEqual({
        status: 'already_processed',
        eventId,
      });

      expect(txMock.payment.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('successful payments', () => {
    it('marks a settlement payment as paid and activates its trial subscription', async () => {
      const result = await service.process(eventId);

      expect(result).toEqual({
        status: 'processed',
        eventId,
      });

      expect(txMock.payment.findUnique).toHaveBeenCalledWith({
        where: {
          id: paymentId,
        },
        include: {
          subscription: true,
        },
      });

      expect(txMock.payment.update).toHaveBeenCalledWith({
        where: {
          id: paymentId,
        },
        data: {
          status: PaymentStatus.PAID,
          providerPaymentId: 'midtrans-transaction-id',
          paidAt: expect.any(Date),
          failedAt: null,
        },
      });

      expect(txMock.subscription.update).toHaveBeenCalledWith({
        where: {
          id: subscriptionId,
        },
        data: expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: expect.any(Date),
          currentPeriodEnd: expect.any(Date),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          provider: 'MIDTRANS',
        }),
      });

      expect(txMock.subscriptionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subscriptionId,
          eventType: SubscriptionEventType.SUBSCRIBED,
          oldStatus: SubscriptionStatus.TRIALING,
          newStatus: SubscriptionStatus.ACTIVE,
        }),
      });

      expect(txMock.webhookEvent.update).toHaveBeenCalledWith({
        where: {
          id: 'webhook-event-id',
        },
        data: {
          status: WebhookEventStatus.PROCESSED,
          processedAt: expect.any(Date),
        },
      });

      expect(prismaMock.webhookEvent.updateMany).not.toHaveBeenCalled();
    });

    it('does not extend a subscription again when the payment is already paid', async () => {
      txMock.payment.findUnique.mockResolvedValue(
        makePayment({
          status: PaymentStatus.PAID,
          providerPaymentId: 'midtrans-transaction-id',
        }),
      );

      const result = await service.process(eventId);

      expect(result.status).toBe('processed');
      expect(txMock.payment.update).not.toHaveBeenCalled();
      expect(txMock.subscription.update).not.toHaveBeenCalled();
      expect(txMock.subscriptionEvent.create).not.toHaveBeenCalled();
    });

    it('does not reactivate a canceled subscription after late settlement', async () => {
      txMock.payment.findUnique.mockResolvedValue(
        makePayment({
          subscription: {
            id: subscriptionId,
            status: SubscriptionStatus.CANCELED,
            billingInterval: 'MONTHLY',
            currentPeriodEnd: null,
          },
        }),
      );

      await service.process(eventId);

      expect(txMock.payment.update).toHaveBeenCalledWith({
        where: {
          id: paymentId,
        },
        data: expect.objectContaining({
          status: PaymentStatus.PAID,
        }),
      });

      expect(txMock.subscription.update).not.toHaveBeenCalled();

      expect(txMock.subscriptionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subscriptionId,
          eventType: SubscriptionEventType.RENEWED,
          oldStatus: SubscriptionStatus.CANCELED,
          newStatus: SubscriptionStatus.CANCELED,
          metadata: expect.objectContaining({
            subscriptionActivationSkipped: true,
          }),
        }),
      });
    });
  });

  describe('payment status transitions', () => {
    it('keeps a pending payment unchanged for a pending notification', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(
        makeEvent({
          payload: {
            order_id: paymentId,
            gross_amount: '99000.00',
            transaction_status: 'pending',
            transaction_id: 'midtrans-transaction-id',
          },
        }),
      );

      const result = await service.process(eventId);

      expect(result.status).toBe('processed');
      expect(txMock.payment.update).not.toHaveBeenCalled();
      expect(txMock.subscription.update).not.toHaveBeenCalled();

      expect(txMock.webhookEvent.update).toHaveBeenCalledWith({
        where: {
          id: 'webhook-event-id',
        },
        data: {
          status: WebhookEventStatus.PROCESSED,
          processedAt: expect.any(Date),
        },
      });
    });

    it('marks a pending payment as failed after a deny notification', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(
        makeEvent({
          payload: {
            order_id: paymentId,
            gross_amount: '99000.00',
            transaction_status: 'deny',
            transaction_id: 'midtrans-transaction-id',
          },
        }),
      );

      await service.process(eventId);

      expect(txMock.payment.update).toHaveBeenCalledWith({
        where: {
          id: paymentId,
        },
        data: {
          status: PaymentStatus.FAILED,
          providerPaymentId: 'midtrans-transaction-id',
          failedAt: expect.any(Date),
        },
      });

      expect(txMock.subscription.update).not.toHaveBeenCalled();
    });

    it('marks a paid payment as refunded after a refund notification', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(
        makeEvent({
          payload: {
            order_id: paymentId,
            gross_amount: '99000.00',
            transaction_status: 'refund',
            transaction_id: 'midtrans-transaction-id',
          },
        }),
      );

      txMock.payment.findUnique.mockResolvedValue(
        makePayment({
          status: PaymentStatus.PAID,
        }),
      );

      await service.process(eventId);

      expect(txMock.payment.update).toHaveBeenCalledWith({
        where: {
          id: paymentId,
        },
        data: {
          status: PaymentStatus.REFUNDED,
          providerPaymentId: 'midtrans-transaction-id',
        },
      });

      // Refund access policy is intentionally not changed by this phase.
      expect(txMock.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('validation and failure handling', () => {
    it('rejects a notification whose amount does not match the payment', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(
        makeEvent({
          payload: {
            order_id: paymentId,
            gross_amount: '100.00',
            transaction_status: 'settlement',
          },
        }),
      );

      await expect(service.process(eventId)).rejects.toThrow(
        BadRequestException,
      );

      expect(txMock.payment.update).not.toHaveBeenCalled();
      expect(txMock.subscription.update).not.toHaveBeenCalled();

      expect(prismaMock.webhookEvent.updateMany).toHaveBeenCalledWith({
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
    });

    it('rejects an order ID that is not a UUID', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(
        makeEvent({
          payload: {
            order_id: 'invalid-payment-id',
            gross_amount: '99000.00',
            transaction_status: 'settlement',
          },
        }),
      );

      await expect(service.process(eventId)).rejects.toThrow(
        'Midtrans order_id is not a valid payment UUID.',
      );

      expect(txMock.payment.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.webhookEvent.updateMany).toHaveBeenCalled();
    });

    it('marks the event failed when Midtrans returns an unsupported status', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(
        makeEvent({
          payload: {
            order_id: paymentId,
            gross_amount: '99000.00',
            transaction_status: 'unknown_status',
          },
        }),
      );

      await expect(service.process(eventId)).rejects.toThrow(
        'Unsupported Midtrans transaction_status: unknown_status',
      );

      expect(prismaMock.webhookEvent.updateMany).toHaveBeenCalled();
      expect(txMock.subscription.update).not.toHaveBeenCalled();
    });

    it('does not overwrite an already processed event during failure recovery', async () => {
      txMock.webhookEvent.findUnique.mockResolvedValue(
        makeEvent({
          payload: {
            order_id: paymentId,
            gross_amount: '100.00',
            transaction_status: 'settlement',
          },
        }),
      );

      prismaMock.webhookEvent.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.process(eventId)).rejects.toThrow(
        BadRequestException,
      );

      expect(prismaMock.webhookEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: [
                WebhookEventStatus.RECEIVED,
                WebhookEventStatus.PROCESSING,
                WebhookEventStatus.FAILED,
              ],
            },
          }),
        }),
      );
    });
  });
});
