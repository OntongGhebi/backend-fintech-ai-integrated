import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActivePlans() {
    return this.prisma.plan.findMany({
      where: {
        isActive: true,
      },
      include: {
        features: {
          orderBy: {
            featureCode: 'asc',
          },
          select: {
            featureCode: true,
            enabled: true,
            limitValue: true,
            limitPeriod: true,
          },
        },
      },
      orderBy: [
        {
          price: 'asc',
        },
        {
          billingInterval: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  findActiveByCode(code: string) {
    return this.prisma.plan.findFirst({
      where: {
        code,
        isActive: true,
      },
      include: {
        features: {
          orderBy: {
            featureCode: 'asc',
          },
          select: {
            featureCode: true,
            enabled: true,
            limitValue: true,
            limitPeriod: true,
          },
        },
      },
    });
  }
}
