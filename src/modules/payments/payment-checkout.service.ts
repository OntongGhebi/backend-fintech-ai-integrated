import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma/prisma.service';

import { MidtransSnapGateway } from './midtrans-snap.gateway';

export interface PaymentCheckoutResponse {
  payment: {
    id: string;
    subscriptionId: string;
    amount: string;
    currency: string;
    status: string;
    provider: string;
    providerPaymentId: string | null;
    createdAt: Date;
  };
  checkout: {
    provider: 'MIDTRANS';
    snapToken: string;
    redirectUrl: string;
  };
}

@Injectable()
export class PaymentCheckoutService {
  private readonly logger = new Logger(PaymentCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly midtransSnapGateway: MidtransSnapGateway,
  ) {}

  async createCheckout(
    userId: string,
    subscriptionId: string,
  ): Promise<PaymentCheckoutResponse> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        userId,
      },
      include: {
        plan: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found.');
    }

    if (
      subscription.status !== 'ACTIVE' &&
      subscription.status !== 'TRIALING'
    ) {
      throw new BadRequestException(
        'Only active or trialing subscriptions can be checked out.',
      );
    }

    if (!subscription.plan.isActive) {
      throw new BadRequestException('This plan is no longer available.');
    }

    if (subscription.plan.currency !== 'IDR') {
      throw new BadRequestException(
        'Only IDR payments are supported at this time.',
      );
    }

    const amount = Number(subscription.plan.price.toString());

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        'The subscription plan has an invalid payment amount.',
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        amount: amount.toString(),
        currency: 'IDR',
        status: 'PENDING',
        provider: 'MIDTRANS',
        metadata: {
          checkoutProvider: 'MIDTRANS',
          environment: 'sandbox',
          planCode: subscription.plan.code,
        },
      },
    });

    let checkout: {
      token: string;
      redirectUrl: string;
    };

    try {
      checkout = await this.midtransSnapGateway.createCheckout({
        orderId: payment.id,
        grossAmount: amount,
        itemId: subscription.plan.id,
        itemName: subscription.plan.name,
      });
    } catch (error: unknown) {
      try {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            metadata: {
              checkoutProvider: 'MIDTRANS',
              environment: 'sandbox',
              checkoutCreationFailed: true,
            },
          },
        });
      } catch {
        this.logger.error(
          `Unable to mark payment ${payment.id} as failed after checkout creation failed.`,
        );
      }

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      this.logger.error(
        `Checkout initialization failed for payment ${payment.id}.`,
      );

      throw new ServiceUnavailableException(
        'Unable to initialize payment checkout. Please try again later.',
      );
    }

    // Keep this database update outside the provider-error catch:
    // a database failure after token creation does not prove the
    // provider transaction failed.
    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: payment.id,
        metadata: {
          checkoutProvider: 'MIDTRANS',
          environment: 'sandbox',
          planCode: subscription.plan.code,
          snapToken: checkout.token,
          redirectUrl: checkout.redirectUrl,
        },
      },
    });

    return {
      payment: {
        id: updatedPayment.id,
        subscriptionId: updatedPayment.subscriptionId,
        amount: updatedPayment.amount.toString(),
        currency: updatedPayment.currency.trim(),
        status: updatedPayment.status,
        provider: updatedPayment.provider,
        providerPaymentId: updatedPayment.providerPaymentId,
        createdAt: updatedPayment.createdAt,
      },
      checkout: {
        provider: 'MIDTRANS',
        snapToken: checkout.token,
        redirectUrl: checkout.redirectUrl,
      },
    };
  }
}
