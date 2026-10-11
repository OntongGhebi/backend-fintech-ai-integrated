import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

import { NotificationEventsService } from 'src/modules/notifications/notification-events.service';

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

  const notificationEventsServiceMock = {
    recurringTransactionExecuted: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    notificationEventsServiceMock.recurringTransactionExecuted.mockResolvedValue(
      undefined,
    );

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
        {
          provide: NotificationEventsService,
          useValue: notificationEventsServiceMock,
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
      await processor.process({ name: 'unknown-job' } as Job);

      expect(repositoryMock.findManyDue).not.toHaveBeenCalled();
      expect(recurringTransactionsServiceMock.execute).not.toHaveBeenCalled();
      expect(
        notificationEventsServiceMock.recurringTransactionExecuted,
      ).not.toHaveBeenCalled();
    });

    it('should query due recurring transactions', async () => {
      repositoryMock.findManyDue.mockResolvedValue([]);

      await processor.process({
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job);

      expect(repositoryMock.findManyDue).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should execute every due recurring transaction', async () => {
      repositoryMock.findManyDue.mockResolvedValue([
        { id: 'recurring-1', userId: 'user-1' },
        { id: 'recurring-2', userId: 'user-2' },
      ]);

      recurringTransactionsServiceMock.execute.mockResolvedValue({
        alreadyExecuted: false,
      });

      await processor.process({
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job);

      expect(recurringTransactionsServiceMock.execute).toHaveBeenCalledTimes(2);
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
    });

    it('should dispatch a notification after a successful execution', async () => {
      repositoryMock.findManyDue.mockResolvedValue([
        { id: 'recurring-1', userId: 'user-1' },
      ]);

      recurringTransactionsServiceMock.execute.mockResolvedValue({
        alreadyExecuted: false,
        transaction: {
          id: 'transaction-1',
          type: 'EXPENSE',
          amount: '150000',
          description: 'Monthly subscription',
        },
      });

      await processor.process({
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job);

      expect(
        notificationEventsServiceMock.recurringTransactionExecuted,
      ).toHaveBeenCalledWith({
        userId: 'user-1',
        recurringTransactionId: 'recurring-1',
        transactionId: 'transaction-1',
        transactionType: 'EXPENSE',
        amount: '150000',
        description: 'Monthly subscription',
      });
    });

    it('should not dispatch a duplicate notification for an already executed occurrence', async () => {
      repositoryMock.findManyDue.mockResolvedValue([
        { id: 'recurring-1', userId: 'user-1' },
      ]);

      recurringTransactionsServiceMock.execute.mockResolvedValue({
        alreadyExecuted: true,
        transaction: {
          id: 'transaction-1',
          type: 'EXPENSE',
          amount: '150000',
          description: 'Monthly subscription',
        },
      });

      await processor.process({
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job);

      expect(
        notificationEventsServiceMock.recurringTransactionExecuted,
      ).not.toHaveBeenCalled();
    });

    it('should continue if notification dispatch fails after transaction execution', async () => {
      repositoryMock.findManyDue.mockResolvedValue([
        { id: 'recurring-1', userId: 'user-1' },
      ]);

      recurringTransactionsServiceMock.execute.mockResolvedValue({
        alreadyExecuted: false,
        transaction: {
          id: 'transaction-1',
          type: 'EXPENSE',
          amount: '150000',
          description: null,
        },
      });

      notificationEventsServiceMock.recurringTransactionExecuted.mockRejectedValueOnce(
        new Error('Queue unavailable'),
      );

      await expect(
        processor.process({
          name: RECURRING_TRANSACTIONS_JOB,
        } as Job),
      ).resolves.toBeUndefined();

      expect(recurringTransactionsServiceMock.execute).toHaveBeenCalledTimes(1);
    });

    it('should not dispatch notifications if no transaction record is returned', async () => {
      repositoryMock.findManyDue.mockResolvedValue([
        { id: 'recurring-1', userId: 'user-1' },
      ]);

      recurringTransactionsServiceMock.execute.mockResolvedValue({
        alreadyExecuted: false,
      });

      await processor.process({
        name: RECURRING_TRANSACTIONS_JOB,
      } as Job);

      expect(
        notificationEventsServiceMock.recurringTransactionExecuted,
      ).not.toHaveBeenCalled();
    });

    it('should propagate recurring execution errors so BullMQ can retry', async () => {
      repositoryMock.findManyDue.mockResolvedValue([
        { id: 'recurring-1', userId: 'user-1' },
      ]);

      recurringTransactionsServiceMock.execute.mockRejectedValue(
        new Error('Recurring transaction execution failed'),
      );

      await expect(
        processor.process({
          name: RECURRING_TRANSACTIONS_JOB,
        } as Job),
      ).rejects.toThrow('Recurring transaction execution failed');

      expect(
        notificationEventsServiceMock.recurringTransactionExecuted,
      ).not.toHaveBeenCalled();
    });
  });
});
