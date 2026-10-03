import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { RecordAIUsageInput } from '../types/ai-usage.types';

@Injectable()
export class AIUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: RecordAIUsageInput) {
    const usage = input.completion.usage;

    return this.prisma.aIUsage.create({
      data: {
        userId: input.userId,
        feature: input.feature,
        provider: input.completion.provider,
        model: input.completion.model,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        estimatedCost: null,
      },
    });
  }

  async findManyByUserId(
    userId: string,
    options?: {
      feature?: string;
      limit?: number;
    },
  ) {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);

    return this.prisma.aIUsage.findMany({
      where: {
        userId,
        ...(options?.feature
          ? {
              feature: options.feature,
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }
}
