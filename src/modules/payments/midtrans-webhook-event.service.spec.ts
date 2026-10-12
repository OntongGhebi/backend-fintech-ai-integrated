import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';

import { PrismaService } from '@/database/prisma/prisma.service';

import { MidtransWebhookEventService } from './midtrans-webhook-event.service';
import { MidtransWebhookSignatureService } from './midtrans-webhook-signature.service';

describe('MidtransWebhookEventService', () => {
  let service: MidtransWebhookEventService;

  const serverKey = 'sandbox-server-key-for-unit-tests';

  const prismaServiceMock = {
    webhookEvent: {
      create: jest.fn(),
    },
  };

  const configServiceMock = {
    get: jest.fn(),
  };

  const makeSignature = (
    orderId: string,
    statusCode: string,
    grossAmount: string,
  ): string =>
    createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`, 'utf8')
      .digest('hex');

  const makeNotification = () => {
    const orderId = 'payment-uuid-123';
    const statusCode = '200';
    const grossAmount = '99000.00';

    return {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: makeSignature(orderId, statusCode, grossAmount),
      transaction_id: 'midtrans-transaction-123',
      transaction_status: 'settlement',
      currency: 'IDR',
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    configServiceMock.get.mockReturnValue(serverKey);
    prismaServiceMock.webhookEvent.create.mockResolvedValue({
      id: 'webhook-event-uuid',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MidtransWebhookEventService,
        MidtransWebhookSignatureService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get(MidtransWebhookEventService);
  });

  it('persists a valid signed notification', async () => {
    const notification = makeNotification();

    const result = await service.receive(notification);

    expect(result.status).toBe('received');
    expect(result.duplicate).toBe(false);

    expect(prismaServiceMock.webhookEvent.create).toHaveBeenCalledTimes(1);

    const createCall = prismaServiceMock.webhookEvent.create.mock.calls[0][0];

    expect(createCall.data.provider).toBe('MIDTRANS');
    expect(createCall.data.eventType).toBe('transaction.notification');
    expect(createCall.data.status).toBe('RECEIVED');
    expect(createCall.data.payload).toEqual(notification);
    expect(createCall.data.eventId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('creates the same idempotency key for the same signed event', async () => {
    const notification = makeNotification();

    const first = await service.receive(notification);
    const second = await service.receive(notification);

    expect(first.eventId).toBe(second.eventId);
  });

  it('returns duplicate when the database reports a unique constraint conflict', async () => {
    prismaServiceMock.webhookEvent.create.mockRejectedValueOnce({
      code: 'P2002',
      message: 'Unique constraint failed',
    });

    const result = await service.receive(makeNotification());

    expect(result).toEqual({
      status: 'received',
      duplicate: true,
      eventId: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('does not persist a notification with an invalid signature', async () => {
    const notification = {
      ...makeNotification(),
      signature_key: 'a'.repeat(128),
    };

    await expect(service.receive(notification)).rejects.toThrow();

    expect(prismaServiceMock.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('propagates database errors other than unique constraint conflicts', async () => {
    const databaseError = new Error('Database unavailable');

    prismaServiceMock.webhookEvent.create.mockRejectedValueOnce(databaseError);

    await expect(service.receive(makeNotification())).rejects.toThrow(
      'Database unavailable',
    );
  });

  it('uses signed fields to derive the idempotency key', async () => {
    const notification = makeNotification();

    const result = await service.receive(notification);

    const expectedEventId = createHash('sha256')
      .update(
        `${notification.order_id}\n${notification.status_code}\n${notification.gross_amount}`,
        'utf8',
      )
      .digest('hex');

    expect(result.eventId).toBe(expectedEventId);
  });
});
