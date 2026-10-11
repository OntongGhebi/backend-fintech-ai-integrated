import { Prisma } from '../../../../generated/prisma/client';
import {
  SubscriptionEventType,
  SubscriptionStatus,
} from '../../../../generated/prisma/enums';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

const CURRENT_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED,
];

const SUBSCRIPTION_INCLUDE = {
  plan: {
    select: {
      id: true,
      code: true,
      name: true,
      price: true,
      currency: true,
      billingInterval: true,
    },
  },
} satisfies Prisma.SubscriptionInclude;

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCurrentByUserId(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: CURRENT_STATUSES },
      },
      include: SUBSCRIPTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async startTrial(userId: string, planCode: string, trialDays: number) {
    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + trialDays);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const plan = await tx.plan.findFirst({
            where: {
              code: planCode,
              isActive: true,
            },
          });

          if (!plan) {
            throw new NotFoundException('Active plan not found');
          }

          const existingSubscription = await tx.subscription.findFirst({
            where: {
              userId,
              status: { in: CURRENT_STATUSES },
            },
            select: { id: true },
          });

          if (existingSubscription) {
            throw new ConflictException(
              'An actibe subscription already exists',
            );
          }

          const previousTrial = await tx.subscription.findFirst({
            where: {
              userId,
              trialStartedAt: { not: null },
            },
            select: { id: true },
          });

          if (previousTrial) {
            throw new ConflictException(
              'A trial has already been used for this account',
            );
          }

          const subscription = await tx.subscription.create({
            data: {
              userId,
              planId: plan.id,
              status: SubscriptionStatus.TRIALING,
              billingInterval: plan.billingInterval,
              trialStartedAt: now,
              trialEndsAt,
              currentPeriodStart: now,
              currentPeriodEnd: trialEndsAt,
              cancelAtPeriodEnd: false,
            },
          });

          await tx.subscriptionEvent.create({
            data: {
              subscriptionId: subscription.id,
              eventType: SubscriptionEventType.TRIAL_STARTED,
              oldStatus: null,
              newStatus: SubscriptionStatus.TRIALING,
              metadata: {
                planCode: plan.code,
                trialDays,
              },
            },
          });

          return tx.subscription.findUniqueOrThrow({
            where: { id: subscription.id },
            include: SUBSCRIPTION_INCLUDE,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Subscription changed concurrently. Please try again',
        );
      }

      throw error;
    }
  }

  async cancelCurrent(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: {
          userId,
          status: { in: CURRENT_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!subscription) {
        throw new NotFoundException('Current subscription not found');
      }

      if (subscription.cancelAtPeriodEnd) {
        return tx.subscription.findUniqueOrThrow({
          where: {
            id: subscription.id,
          },
          include: SUBSCRIPTION_INCLUDE,
        });
      }

      if (subscription.status === SubscriptionStatus.TRIALING) {
        const updated = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.CANCELED,
            canceledAt: new Date(),
            cancelAtPeriodEnd: false,
          },
        });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: subscription.id,
            eventType: SubscriptionEventType.CANCELED,
            oldStatus: subscription.status,
            newStatus: SubscriptionStatus.CANCELED,
            metadata: { reason: 'trial_cancelled' },
          },
        });

        return tx.subscription.findUniqueOrThrow({
          where: { id: updated.id },
          include: SUBSCRIPTION_INCLUDE,
        });
      }

      if (subscription.status !== SubscriptionStatus.ACTIVE) {
        throw new ConflictException(
          'Only active subscriptions can be scheduled for cancellation',
        );
      }

      const updated = await tx.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: SubscriptionEventType.CANCELED,
          oldStatus: subscription.status,
          newStatus: subscription.status,
          metadata: { cancelAtPeriodEnd: true },
        },
      });

      return tx.subscription.findUniqueOrThrow({
        where: { id: updated.id },
        include: SUBSCRIPTION_INCLUDE,
      });
    });
  }

  async resumeCurrent(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: {
          userId,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!subscription) {
        throw new NotFoundException('Current subscription not found');
      }

      if (!subscription.cancelAtPeriodEnd) {
        throw new ConflictException(
          'Subscription is not scheduled for cancellation',
        );
      }

      const updated = await tx.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: false },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: SubscriptionEventType.RESUMED,
          oldStatus: subscription.status,
          newStatus: subscription.status,
          metadata: { cancelAtPeriodEnd: false },
        },
      });

      return tx.subscription.findUniqueOrThrow({
        where: { id: updated.id },
        include: SUBSCRIPTION_INCLUDE,
      });
    });
  }
}
