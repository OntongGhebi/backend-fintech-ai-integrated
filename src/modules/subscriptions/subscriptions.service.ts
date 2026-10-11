import { Injectable, NotFoundException } from '@nestjs/common';

import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';

type SubscriptionRecord = NonNullable<
  Awaited<ReturnType<SubscriptionsRepository['findCurrentByUserId']>>
>;

const TRIAL_DAYS = 7;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  async getCurrent(userId: string): Promise<SubscriptionResponseDto> {
    const subscription =
      await this.subscriptionsRepository.findCurrentByUserId(userId);

    if (!subscription) {
      throw new NotFoundException('Current subscription not found');
    }

    return this.toResponse(subscription);
  }

  async startTrial(
    userId: string,
    planCode: string,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionsRepository.startTrial(
      userId,
      planCode.trim(),
      TRIAL_DAYS,
    );

    return this.toResponse(subscription);
  }

  async cancelCurrent(userId: string): Promise<SubscriptionResponseDto> {
    const subscription =
      await this.subscriptionsRepository.cancelCurrent(userId);

    return this.toResponse(subscription);
  }

  async resumeCurrent(userId: string): Promise<SubscriptionResponseDto> {
    const subscription =
      await this.subscriptionsRepository.resumeCurrent(userId);

    return this.toResponse(subscription);
  }

  private toResponse(
    subscription: SubscriptionRecord,
  ): SubscriptionResponseDto {
    return {
      id: subscription.id,
      userId: subscription.userId,
      planId: subscription.planId,
      status: subscription.status,
      billingInterval: subscription.billingInterval,
      trialStartedAt: subscription.trialStartedAt,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      plan: {
        id: subscription.plan.id,
        code: subscription.plan.code,
        name: subscription.plan.name,
        price: subscription.plan.price.toString(),
        currency: subscription.plan.currency,
        billingInterval: subscription.plan.billingInterval,
      },
    };
  }
}
