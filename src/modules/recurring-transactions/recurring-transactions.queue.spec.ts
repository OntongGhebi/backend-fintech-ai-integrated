import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import { RECURRING_TRANSACTIONS_QUEUE } from './recurring-transactions.constants';
import { RecurringTransactionsProcessor } from './recurring-transactions.processor';
import { RecurringTransactionsRepository } from './repositories/recurring-transactions.repository';
import { RecurringTransactionsScheduler } from './recurring-transactions.scheduler';
import { RecurringTransactionsService } from './recurring-transactions.service';

describe('Recurring Transactions Queue Wiring', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        RecurringTransactionsScheduler,
        RecurringTransactionsProcessor,

        {
          provide: getQueueToken(RECURRING_TRANSACTIONS_QUEUE),
          useValue: {
            upsertJobScheduler: jest.fn(),
          },
        },

        {
          provide: RecurringTransactionsRepository,
          useValue: {
            findManyDue: jest.fn(),
          },
        },

        {
          provide: RecurringTransactionsService,
          useValue: {
            execute: jest.fn(),
          },
        },
      ],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should resolve the scheduler', () => {
    expect(module.get(RecurringTransactionsScheduler)).toBeDefined();
  });

  it('should resolve the processor', () => {
    expect(module.get(RecurringTransactionsProcessor)).toBeDefined();
  });

  it('should resolve the registered recurring transaction queue', () => {
    expect(
      module.get(getQueueToken(RECURRING_TRANSACTIONS_QUEUE)),
    ).toBeDefined();
  });

  it('should resolve the repository dependency', () => {
    expect(module.get(RecurringTransactionsRepository)).toBeDefined();
  });

  it('should resolve the service dependency', () => {
    expect(module.get(RecurringTransactionsService)).toBeDefined();
  });
});
