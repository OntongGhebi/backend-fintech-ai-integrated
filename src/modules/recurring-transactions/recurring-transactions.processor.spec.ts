import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

import { RECURRING_TRANSACTIONS_JOB } from './recurring-transactions.constants';
import { RecurringTransactionsProcessor } from './recurring-transactions.processor';
import { RecurringTransactionsRepository } from './repositories/recurring-transactions.repository';
import { RecurringTransactionsService } from './recurring-transactions.service';

describe('RecurringTransactionsProcessor', () => {
  let processor: RecurringTransactionsProcessor;

  const repositoryMock = {
    findManyDue: jest.fn(),
  };

  const recurringTransactionsServiceMock = {
    execute: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringTransactionsProcessor,
        {
          provide: RecurringTransactionsRepository,
          useValue: repositoryMock,
        },
        {
          provide: RecurringTransactionsService,
          useValue: recurringTransactionsServiceMock,
        },
      ],
    }).compile();

    processor = module.get(RecurringTransactionsProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should ignore unknown jobs', async () => {
      const job = {
        name: 'unknown-job',
      } as Job;

      await processor.process(job);

      expect(repositoryMock.findManyDue).not.toHaveBeenCalled();

      expect(recurringTransactionsServiceMock.execute).not.toHaveBeenCalled();
    });

    it('should query due recurring transactions', async () => {
      repositoryMock.findManyDue.mockResolvedValue([]);

      const job = {
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job;

      await processor.process(job);

      expect(repositoryMock.findManyDue).toHaveBeenCalledTimes(1);

      expect(repositoryMock.findManyDue).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should execute every due recurring transaction', async () => {
      const dueTransactions = [
        {
          id: 'recurring-1',
          userId: 'user-1',
        },
        {
          id: 'recurring-2',
          userId: 'user-2',
        },
        {
          id: 'recurring-3',
          userId: 'user-3',
        },
      ];

      repositoryMock.findManyDue.mockResolvedValue(dueTransactions);

      recurringTransactionsServiceMock.execute.mockResolvedValue({
        alreadyExecuted: false,
      });

      const job = {
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job;

      await processor.process(job);

      expect(recurringTransactionsServiceMock.execute).toHaveBeenCalledTimes(3);

      expect(recurringTransactionsServiceMock.execute).toHaveBeenNthCalledWith(
        1,
        'user-1',
        'recurring-1',
      );

      expect(recurringTransactionsServiceMock.execute).toHaveBeenNthCalledWith(
        2,
        'user-2',
        'recurring-2',
      );

      expect(recurringTransactionsServiceMock.execute).toHaveBeenNthCalledWith(
        3,
        'user-3',
        'recurring-3',
      );
    });

    it('should handle an already executed occurrence', async () => {
      const dueTransaction = {
        id: 'recurring-1',
        userId: 'user-1',
      };

      repositoryMock.findManyDue.mockResolvedValue([dueTransaction]);

      recurringTransactionsServiceMock.execute.mockResolvedValue({
        alreadyExecuted: true,
      });

      const job = {
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job;

      await expect(processor.process(job)).resolves.toBeUndefined();

      expect(recurringTransactionsServiceMock.execute).toHaveBeenCalledWith(
        'user-1',
        'recurring-1',
      );
    });

    it('should resolve without executing anything when no transaction is due', async () => {
      repositoryMock.findManyDue.mockResolvedValue([]);

      const job = {
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job;

      await expect(processor.process(job)).resolves.toBeUndefined();

      expect(recurringTransactionsServiceMock.execute).not.toHaveBeenCalled();
    });

    it('should propagate execution errors so BullMQ can retry the job', async () => {
      const dueTransaction = {
        id: 'recurring-1',
        userId: 'user-1',
      };

      const error = new Error('Recurring transaction execution failed');

      repositoryMock.findManyDue.mockResolvedValue([dueTransaction]);

      recurringTransactionsServiceMock.execute.mockRejectedValue(error);

      const job = {
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job;

      await expect(processor.process(job)).rejects.toThrow(
        'Recurring transaction execution failed',
      );

      expect(recurringTransactionsServiceMock.execute).toHaveBeenCalledWith(
        'user-1',
        'recurring-1',
      );
    });
  });
});
