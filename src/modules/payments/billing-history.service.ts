import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { BillingHistoryQueryDto } from './dto/payment-history.dto';

@Injectable()
export class BillingHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getPaymentHistory(userId: string, query: BillingHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = { userId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        skip,
        take: limit,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          provider: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
          subscription: {
            select: {
              id: true,
              status: true,
              billingInterval: true,
              plan: {
                select: {
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: this.buildPaginationMeta(page, limit, total),
    };
  }

  async getSubscriptionHistory(userId: string, query: BillingHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      subscription: {
        userId,
      },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.subscriptionEvent.findMany({
        where,
        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        skip,
        take: limit,
        select: {
          id: true,
          eventType: true,
          oldStatus: true,
          newStatus: true,
          createdAt: true,
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
        },
      }),
      this.prisma.subscriptionEvent.count({ where }),
    ]);

    return {
      data,
      meta: this.buildPaginationMeta(page, limit, total),
    };
  }

  private buildPaginationMeta(page: number, limit: number, total: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }
}
