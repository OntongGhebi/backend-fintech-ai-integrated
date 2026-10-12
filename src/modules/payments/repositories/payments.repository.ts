import { Injectable } from '@nestjs/common';
// import { PaymentStatus } from '../../../../generated/prisma/enums';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { GetPaymentsQueryDto } from '../dto/get-payments-query.dto';

const PAYMENT_INCLUDE = {
  subscription: {
    select: {
      id: true,
      billingInterval: true,
      plan: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByUserId(userId: string, query: GetPaymentsQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const skip = (query.page - 1) * query.limit;

    return this.prisma.$transaction(async (tx) => {
      const [payments, totalItems] = await Promise.all([
        tx.payment.findMany({
          where,
          include: PAYMENT_INCLUDE,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: query.limit,
        }),
        tx.payment.count({ where }),
      ]);

      return {
        payments,
        totalItems,
      };
    });
  }

  findByIdAndUserId(paymentId: string, userId: string) {
    return this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        userId,
      },
      include: PAYMENT_INCLUDE,
    });
  }
}
