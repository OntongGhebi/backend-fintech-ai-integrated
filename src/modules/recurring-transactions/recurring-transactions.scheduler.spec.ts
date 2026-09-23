import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import {
  RECURRING_TRANSACTIONS_JOB,
  RECURRING_TRANSACTIONS_QUEUE,
  RECURRING_TRANSACTIONS_SCHEDULE_INTERVAL_MS,
  RECURRING_TRANSACTIONS_SCHEDULER_ID,
} from './recurring-transactions.constants';
import { RecurringTransactionsScheduler } from './recurring-transactions.scheduler';

describe('RecurringTransactionsScheduler', () => {
  let scheduler: RecurringTransactionsScheduler;

  const queueMock = {
    upsertJobScheduler: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringTransactionsScheduler,
        {
          provide: getQueueToken(RECURRING_TRANSACTIONS_QUEUE),
          useValue: queueMock,
        },
      ],
    }).compile();

    scheduler = module.get(RecurringTransactionsScheduler);
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  describe('registerScheduler', () => {
    it('should register the recurring transaction job scheduler', async () => {
      queueMock.upsertJobScheduler.mockResolvedValue(undefined);

      await scheduler.registerScheduler();

      expect(queueMock.upsertJobScheduler).toHaveBeenCalledTimes(1);

      expect(queueMock.upsertJobScheduler).toHaveBeenCalledWith(
        RECURRING_TRANSACTIONS_SCHEDULER_ID,
        {
          every: RECURRING_TRANSACTIONS_SCHEDULE_INTERVAL_MS,
        },
        {
          name: RECURRING_TRANSACTIONS_JOB,
          data: {},
          opts: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            removeOnComplete: 100,
            removeOnFail: 1000,
          },
        },
      );
    });

    it('should propagate queue registration errors', async () => {
      const error = new Error('Redis scheduler registration failed');

      queueMock.upsertJobScheduler.mockRejectedValue(error);

      await expect(scheduler.registerScheduler()).rejects.toThrow(
        'Redis scheduler registration failed',
      );
    });
  });

  describe('onModuleInit', () => {
    it('should register the scheduler during module initialization', async () => {
      const registerSchedulerSpy = jest
        .spyOn(scheduler, 'registerScheduler')
        .mockResolvedValue(undefined);

      await scheduler.onModuleInit();

      expect(registerSchedulerSpy).toHaveBeenCalledTimes(1);
    });
  });
});
