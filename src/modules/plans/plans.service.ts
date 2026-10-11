import { Injectable, NotFoundException } from '@nestjs/common';

import { PlansRepository } from './repositories/plans.repository';
import { PlanResponseDto } from './dto/plan-response.dto';

@Injectable()
export class PlansService {
  constructor(private readonly plansRepository: PlansRepository) {}

  async findAllActive(): Promise<PlanResponseDto[]> {
    const plans = await this.plansRepository.findActivePlans();

    return plans.map((plan) => this.toResponse(plan));
  }

  async findActiveByCode(code: string): Promise<PlanResponseDto> {
    const normalizedCode = code.trim();

    const plan = await this.plansRepository.findActiveByCode(normalizedCode);

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return this.toResponse(plan);
  }

  private toResponse(plan: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    price: { toString(): string };
    currency: string;
    billingInterval: string;
    isActive: boolean;
    features: Array<{
      featureCode: string;
      enabled: boolean;
      limitValue: number | null;
      limitPeriod: string | null;
    }>;
  }): PlanResponseDto {
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      price: plan.price.toString(),
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      isActive: plan.isActive,
      features: plan.features.map((feature) => ({
        featureCode: feature.featureCode,
        enabled: feature.enabled,
        limitValue: feature.limitValue,
        limitPeriod: feature.limitPeriod,
      })),
    };
  }
}
