import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../database/prisma/prisma.service';

import { MidtransSnapGateway } from './midtrans-snap.gateway';
import { PaymentCheckoutService } from './payment-checkout.service';

describe('PaymentCheckoutService', () => {
  let service: PaymentCheckoutService;

  const prismaMock = {
    subscription: {
      findFirst: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const gatewayMock = {
    createCheckout: jest.fn(),
  };

  const subscriptionMock = {
    id: 'subscription-uuid-1',
    userId: 'user-uuid-1',
    status: 'ACTIVE',
    plan: {
      id: 'plan-uuid-1',
      code: 'PREMIUM',
      name: 'Premium Plan',
      price: { toString: () => '99000' },
      currency: 'IDR',
      isActive: true,
    },
  };

  const paymentMock = {
    id: 'payment-uuid-1',
    subscriptionId: 'subscription-uuid-1',
    amount: { toString: () => '99000' },
    currency: 'IDR',
    status: 'PENDING',
    provider: 'MIDTRANS',
    providerPaymentId: null,
    createdAt: new Date('2026-10-12T10:00:00.000Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentCheckoutService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: MidtransSnapGateway,
          useValue: gatewayMock,
        },
      ],
    }).compile();

    service = module.get(PaymentCheckoutService);

    prismaMock.subscription.findFirst.mockResolvedValue(subscriptionMock);
    prismaMock.payment.create.mockResolvedValue(paymentMock);
    prismaMock.payment.update.mockResolvedValue(paymentMock);
    gatewayMock.createCheckout.mockResolvedValue({
      token: 'sandbox-snap-token',
      redirectUrl: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/example',
    });
  });

  it('creates a pending payment and returns Snap checkout details', async () => {
    const result = await service.createCheckout(
      'user-uuid-1',
      'subscription-uuid-1',
    );

    expect(prismaMock.subscription.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'subscription-uuid-1',
        userId: 'user-uuid-1',
      },
      include: {
        plan: true,
      },
    });

    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-uuid-1',
        subscriptionId: 'subscription-uuid-1',
        amount: '99000',
        currency: 'IDR',
        status: 'PENDING',
        provider: 'MIDTRANS',
        metadata: {
          checkoutProvider: 'MIDTRANS',
          environment: 'sandbox',
          planCode: 'PREMIUM',
        },
      }),
    });

    // The local payment UUID is the Midtrans order_id.
    // It must not be written as providerPaymentId.
    const createCall = prismaMock.payment.create.mock.calls[0][0];
    expect(createCall.data).not.toHaveProperty('providerPaymentId');

    expect(gatewayMock.createCheckout).toHaveBeenCalledWith({
      orderId: 'payment-uuid-1',
      grossAmount: 99000,
      itemId: 'plan-uuid-1',
      itemName: 'Premium Plan',
    });

    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-uuid-1' },
      data: {
        metadata: {
          checkoutProvider: 'MIDTRANS',
          environment: 'sandbox',
          planCode: 'PREMIUM',
          snapToken: 'sandbox-snap-token',
          redirectUrl: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/example',
        },
      },
    });

    expect(result).toEqual({
      payment: {
        id: 'payment-uuid-1',
        subscriptionId: 'subscription-uuid-1',
        amount: '99000',
        currency: 'IDR',
        status: 'PENDING',
        provider: 'MIDTRANS',
        providerPaymentId: null,
        createdAt: paymentMock.createdAt,
      },
      checkout: {
        provider: 'MIDTRANS',
        snapToken: 'sandbox-snap-token',
        redirectUrl: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/example',
      },
    });
  });

  it('rejects a subscription that is not owned by the current user', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue(null);

    await expect(
      service.createCheckout('another-user', 'subscription-uuid-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(gatewayMock.createCheckout).not.toHaveBeenCalled();
  });

  it('rejects a non-IDR plan', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue({
      ...subscriptionMock,
      plan: {
        ...subscriptionMock.plan,
        currency: 'USD',
      },
    });

    await expect(
      service.createCheckout('user-uuid-1', 'subscription-uuid-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a zero or invalid plan price', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue({
      ...subscriptionMock,
      plan: {
        ...subscriptionMock.plan,
        price: { toString: () => '0' },
      },
    });

    await expect(
      service.createCheckout('user-uuid-1', 'subscription-uuid-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  it('marks the payment failed if Midtrans checkout creation fails', async () => {
    gatewayMock.createCheckout.mockRejectedValue(
      new ServiceUnavailableException('Provider unavailable'),
    );

    await expect(
      service.createCheckout('user-uuid-1', 'subscription-uuid-1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment-uuid-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          failedAt: expect.any(Date),
          metadata: expect.objectContaining({
            checkoutCreationFailed: true,
          }),
        }),
      }),
    );
  });

  it('rejects a canceled subscription', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue({
      ...subscriptionMock,
      status: 'CANCELED',
    });

    await expect(
      service.createCheckout('user-uuid-1', 'subscription-uuid-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(gatewayMock.createCheckout).not.toHaveBeenCalled();
  });

  it('rejects an inactive plan', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue({
      ...subscriptionMock,
      plan: {
        ...subscriptionMock.plan,
        isActive: false,
      },
    });

    await expect(
      service.createCheckout('user-uuid-1', 'subscription-uuid-1'),
    ).rejects.toThrow('This plan is no longer available.');

    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(gatewayMock.createCheckout).not.toHaveBeenCalled();
  });
});
