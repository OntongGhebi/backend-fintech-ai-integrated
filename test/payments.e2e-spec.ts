import {
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import request from 'supertest';

import { AccessTokenGuard } from '../src/modules/auth/guards/access-token.guard';
import { BillingHistoryController } from '../src/modules/payments/billing-history.controller';
import { BillingHistoryService } from '../src/modules/payments/billing-history.service';
import { MidtransWebhookEventService } from '../src/modules/payments/midtrans-webhook-event.service';
import { MidtransWebhookController } from '../src/modules/payments/midtrans-webhook.controller';
import { MidtransWebhookProcessingService } from '../src/modules/payments/midtrans-webhook-processing.service';
import { PaymentCheckoutController } from '../src/modules/payments/payment-checkout.controller';
import { PaymentCheckoutService } from '../src/modules/payments/payment-checkout.service';
import { PaymentsController } from '../src/modules/payments/payments.controller';
import { PaymentsService } from '../src/modules/payments/payments.service';

jest.setTimeout(30000);

describe('Payments and Billing History (e2e)', () => {
  let app: INestApplication;

  const userId = 'e2e-user-1';
  const paymentId = '550e8400-e29b-41d4-a716-446655440000';
  const subscriptionId = '650e8400-e29b-41d4-a716-446655440001';
  const eventId = 'e2e-midtrans-event-id';

  const paymentCheckoutService = {
    createCheckout: jest.fn(),
  };

  const paymentsService = {
    findManyByUserId: jest.fn(),
    findById: jest.fn(),
  };

  const billingHistoryService = {
    getPaymentHistory: jest.fn(),
    getSubscriptionHistory: jest.fn(),
  };

  const webhookEventService = {
    receive: jest.fn(),
  };

  const webhookProcessingService = {
    process: jest.fn(),
  };

  const checkoutResponse = {
    payment: {
      id: paymentId,
      subscriptionId,
      amount: '99000',
      currency: 'IDR',
      status: 'PENDING',
      provider: 'MIDTRANS',
      providerPaymentId: paymentId,
      createdAt: '2026-10-15T10:00:00.000Z',
    },
    checkout: {
      provider: 'MIDTRANS',
      snapToken: 'mock-snap-token',
      redirectUrl: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/mock-token',
    },
  };

  const paymentResponse = {
    id: paymentId,
    userId,
    subscriptionId,
    amount: '99000',
    currency: 'IDR',
    status: 'PENDING',
    provider: 'MIDTRANS',
    providerPaymentId: paymentId,
    paidAt: null,
    failedAt: null,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    subscription: {
      id: subscriptionId,
      planCode: 'PRO',
      planName: 'Pro',
      billingInterval: 'MONTHLY',
    },
  };

  const emptyPaymentHistory = {
    data: [],
    meta: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };

  const emptyPaymentsList = {
    data: [],
    page: 1,
    limit: 10,
    totalItems: 0,
    totalPages: 0,
  };

  const webhookPayload = {
    order_id: paymentId,
    status_code: '200',
    gross_amount: '99000.00',
    signature_key: 'a'.repeat(128),
    transaction_status: 'settlement',
    transaction_id: 'midtrans-transaction-e2e-001',
    transaction_time: '2026-10-15 10:00:00',
    payment_type: 'bank_transfer',
    currency: 'IDR',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        PaymentCheckoutController,
        MidtransWebhookController,
        PaymentsController,
        BillingHistoryController,
      ],
      providers: [
        {
          provide: PaymentCheckoutService,
          useValue: paymentCheckoutService,
        },
        {
          provide: PaymentsService,
          useValue: paymentsService,
        },
        {
          provide: BillingHistoryService,
          useValue: billingHistoryService,
        },
        {
          provide: MidtransWebhookEventService,
          useValue: webhookEventService,
        },
        {
          provide: MidtransWebhookProcessingService,
          useValue: webhookProcessingService,
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext): boolean => {
          const req = context
            .switchToHttp()
            .getRequest<Request & { user?: { id: string } }>();

          if (req.headers.authorization !== 'Bearer e2e-access-token') {
            throw new UnauthorizedException('Missing or invalid access token');
          }

          req.user = { id: userId };

          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.resetAllMocks();

    paymentCheckoutService.createCheckout.mockResolvedValue(checkoutResponse);

    paymentsService.findManyByUserId.mockResolvedValue(emptyPaymentsList);
    paymentsService.findById.mockResolvedValue(paymentResponse);

    billingHistoryService.getPaymentHistory.mockResolvedValue(
      emptyPaymentHistory,
    );
    billingHistoryService.getSubscriptionHistory.mockResolvedValue(
      emptyPaymentHistory,
    );

    webhookEventService.receive.mockResolvedValue({
      status: 'received',
      duplicate: false,
      eventId,
    });

    webhookProcessingService.process.mockResolvedValue({
      status: 'processed',
      eventId,
    });
  });

  describe('POST /api/v1/payments/checkout', () => {
    it('creates a checkout for an authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/checkout')
        .set('Authorization', 'Bearer e2e-access-token')
        .send({ subscriptionId })
        .expect(201);

      expect(response.body).toMatchObject({
        payment: {
          id: paymentId,
          subscriptionId,
          amount: '99000',
          currency: 'IDR',
          status: 'PENDING',
          provider: 'MIDTRANS',
        },
        checkout: {
          provider: 'MIDTRANS',
          snapToken: 'mock-snap-token',
        },
      });

      expect(paymentCheckoutService.createCheckout).toHaveBeenCalledWith(
        userId,
        subscriptionId,
      );
    });

    it('rejects checkout without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/payments/checkout')
        .send({ subscriptionId })
        .expect(401);

      expect(paymentCheckoutService.createCheckout).not.toHaveBeenCalled();
    });

    it('rejects an invalid subscription UUID', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/checkout')
        .set('Authorization', 'Bearer e2e-access-token')
        .send({ subscriptionId: 'not-a-uuid' })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(paymentCheckoutService.createCheckout).not.toHaveBeenCalled();
    });

    it('rejects unknown request properties', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/payments/checkout')
        .set('Authorization', 'Bearer e2e-access-token')
        .send({
          subscriptionId,
          userId: 'another-user',
          amount: 1,
        })
        .expect(400);

      expect(paymentCheckoutService.createCheckout).not.toHaveBeenCalled();
    });

    it('returns 404 when the subscription does not exist for the user', async () => {
      paymentCheckoutService.createCheckout.mockRejectedValueOnce(
        new NotFoundException('Subscription not found.'),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/checkout')
        .set('Authorization', 'Bearer e2e-access-token')
        .send({ subscriptionId })
        .expect(404);

      expect(response.body.message).toBe('Subscription not found.');
    });
  });

  describe('POST /api/v1/payments/webhooks/midtrans', () => {
    it('accepts a valid notification and invokes webhook processing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send(webhookPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'received',
        duplicate: false,
        eventId,
        processing: {
          status: 'processed',
          eventId,
        },
      });

      expect(webhookEventService.receive).toHaveBeenCalledWith(webhookPayload);
      expect(webhookProcessingService.process).toHaveBeenCalledWith(eventId);
    });

    it('returns 401 when webhook verification rejects the payload', async () => {
      webhookEventService.receive.mockRejectedValueOnce(
        new UnauthorizedException('Invalid Midtrans notification signature.'),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send(webhookPayload)
        .expect(401);

      expect(response.body.message).toBe(
        'Invalid Midtrans notification signature.',
      );
      expect(webhookProcessingService.process).not.toHaveBeenCalled();
    });

    it('does not process an event when receiving the notification fails', async () => {
      webhookEventService.receive.mockRejectedValueOnce(
        new UnauthorizedException('Invalid Midtrans notification payload.'),
      );

      await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send({})
        .expect(401);

      expect(webhookProcessingService.process).not.toHaveBeenCalled();
    });

    it('returns an error when event processing fails', async () => {
      webhookProcessingService.process.mockRejectedValueOnce(
        new NotFoundException('Webhook event not found.'),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/midtrans')
        .send(webhookPayload)
        .expect(404);

      expect(response.body.message).toBe('Webhook event not found.');
      expect(webhookEventService.receive).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/v1/payments/history', () => {
    it('returns the authenticated user payment history', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/payments/history')
        .set('Authorization', 'Bearer e2e-access-token')
        .expect(200);

      expect(response.body).toEqual(emptyPaymentHistory);
      expect(billingHistoryService.getPaymentHistory).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          page: 1,
          limit: 20,
        }),
      );
    });

    it('supports pagination query parameters', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/payments/history?page=2&limit=5')
        .set('Authorization', 'Bearer e2e-access-token')
        .expect(200);

      expect(billingHistoryService.getPaymentHistory).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          page: 2,
          limit: 5,
        }),
      );
    });

    it('rejects an invalid page number', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/payments/history?page=0')
        .set('Authorization', 'Bearer e2e-access-token')
        .expect(400);

      expect(billingHistoryService.getPaymentHistory).not.toHaveBeenCalled();
    });

    it('rejects a limit exceeding the maximum', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/payments/history?limit=101')
        .set('Authorization', 'Bearer e2e-access-token')
        .expect(400);

      expect(billingHistoryService.getPaymentHistory).not.toHaveBeenCalled();
    });

    it('rejects requests without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/payments/history')
        .expect(401);

      expect(billingHistoryService.getPaymentHistory).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/payments/me', () => {
    it('returns the authenticated user payment list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/payments/me')
        .set('Authorization', 'Bearer e2e-access-token')
        .expect(200);

      expect(response.body).toEqual(emptyPaymentsList);
      expect(paymentsService.findManyByUserId).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      );
    });

    it('rejects requests without authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/payments/me').expect(401);

      expect(paymentsService.findManyByUserId).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/payments/:paymentId', () => {
    it('returns payment details for an authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', 'Bearer e2e-access-token')
        .expect(200);

      expect(response.body).toMatchObject({
        id: paymentId,
        userId,
        subscriptionId,
        amount: '99000',
        currency: 'IDR',
        provider: 'MIDTRANS',
      });

      expect(paymentsService.findById).toHaveBeenCalledWith(paymentId, userId);
    });

    it('rejects a malformed payment UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/payments/not-a-uuid')
        .set('Authorization', 'Bearer e2e-access-token')
        .expect(400);

      expect(paymentsService.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when a payment is not found for the user', async () => {
      paymentsService.findById.mockRejectedValueOnce(
        new NotFoundException('Payment not found'),
      );

      const response = await request(app.getHttpServer())
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', 'Bearer e2e-access-token')
        .expect(404);

      expect(response.body.message).toBe('Payment not found');
    });

    it('rejects requests without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/payments/${paymentId}`)
        .expect(401);

      expect(paymentsService.findById).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/subscriptions/history', () => {
    it('returns the authenticated user subscription history', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/subscriptions/history')
        .set('Authorization', 'Bearer e2e-access-token')
        .expect(200);

      expect(response.body).toEqual(emptyPaymentHistory);
      expect(billingHistoryService.getSubscriptionHistory).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          page: 1,
          limit: 20,
        }),
      );
    });

    it('rejects requests without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/subscriptions/history')
        .expect(401);

      expect(
        billingHistoryService.getSubscriptionHistory,
      ).not.toHaveBeenCalled();
    });
  });
});
