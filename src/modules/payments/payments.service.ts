import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentsRepository } from './repositories/payments.repository';
import { GetPaymentsQueryDto } from './dto/get-payments-query.dto';
import { PaymentListResponseDto } from './dto/payment-list-response.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';

type PaymentRecord = NonNullable<
  Awaited<ReturnType<PaymentsRepository['findByIdAndUserId']>>
>;

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentsRepository: PaymentsRepository) {}

  async findManyByUserId(
    userId: string,
    query: GetPaymentsQueryDto,
  ): Promise<PaymentListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const result = await this.paymentsRepository.findManyByUserId(userId, {
      ...query,
      page,
      limit,
    });

    return {
      data: result.payments.map((payment) => this.toResponse(payment)),
      page,
      limit,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / limit),
    };
  }

  async findById(
    paymentId: string,
    userId: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.paymentsRepository.findByIdAndUserId(
      paymentId,
      userId,
    );

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.toResponse(payment);
  }

  private toResponse(payment: PaymentRecord): PaymentResponseDto {
    return {
      id: payment.id,
      userId: payment.userId,
      subscriptionId: payment.subscriptionId,
      amount: payment.amount.toString(),
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      paidAt: payment.paidAt,
      failedAt: payment.failedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.createdAt,
      subscription: {
        id: payment.subscription.id,
        planCode: payment.subscription.plan.code,
        planName: payment.subscription.plan.name,
        billingInterval: payment.subscription.billingInterval,
      },
    };
  }
}
