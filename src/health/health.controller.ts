import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Liveness: confirms that the API process can respond.
   * It intentionally does not depend on PostgreSQL or Redis.
   */
  @Get('live')
  live() {
    return {
      status: 'ok',
    };
  }

  /**
   * Readiness: confirms that required infrastructure is reachable.
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.checkDependencies();
  }

  /**
   * Backward-compatible readiness endpoint.
   * Existing integrations can continue using GET /health.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.checkDependencies();
  }

  private checkDependencies() {
    return this.health.check([
      () => this.database.isHealthy(),
      () => this.redis.isHealthy(),
    ]);
  }
}
