import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  let health: {
    check: jest.Mock;
  };

  let database: {
    isHealthy: jest.Mock;
  };

  let redis: {
    isHealthy: jest.Mock;
  };

  beforeEach(() => {
    health = {
      check: jest.fn().mockResolvedValue({
        status: 'ok',
        info: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
        error: {},
        details: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      }),
    };

    database = {
      isHealthy: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };

    redis = {
      isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up' } }),
    };

    controller = new HealthController(
      health as any,
      database as any,
      redis as any,
    );
  });

  it('should return liveness without checking external dependencies', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(health.check).not.toHaveBeenCalled();
    expect(database.isHealthy).not.toHaveBeenCalled();
    expect(redis.isHealthy).not.toHaveBeenCalled();
  });

  it('should run dependency checks for readiness', async () => {
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
    });

    expect(health.check).toHaveBeenCalledTimes(1);

    const checks = health.check.mock.calls[0][0];

    expect(checks).toHaveLength(2);
    expect(typeof checks[0]).toBe('function');
    expect(typeof checks[1]).toBe('function');
  });

  it('should preserve the existing health endpoint behavior', async () => {
    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
    });

    expect(health.check).toHaveBeenCalledTimes(1);
  });
});
