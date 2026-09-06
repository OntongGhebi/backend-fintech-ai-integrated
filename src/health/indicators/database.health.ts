import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prismaService: PrismaService,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check('database');

    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
