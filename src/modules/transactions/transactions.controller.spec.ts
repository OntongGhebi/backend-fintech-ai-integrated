import { Test, TestingModule } from '@nestjs/testing';

import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

describe('TransactionsController', () => {
  let controller: TransactionsController;

  let transactionsService: {
    create: jest.Mock;
    createTransfer: jest.Mock;
    findManyByUserId: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    voidTransaction: jest.Mock;
  };

  const userId = '11111111-1111-4111-8111-111111111111';

  const accountId = '22222222-2222-4222-8222-222222222222';

  const transactionId = '55555555-5555-4555-8555-555555555555';

  const transferGroupId = '66666666-6666-4666-8666-666666666666';

  const transaction = {
    id: transactionId,
    userId,
    accountId,
    categoryId: null,
    type: 'EXPENSE',
    amount: {
      toString: () => '75000.0000',
    },
    currency: 'IDR',
    description: 'Lunch',
    transactionDate: new Date('2026-09-15T03:00:00.000Z'),
    source: 'MANUAL',
    status: 'ACTIVE',
    transferGroupId: null,
    createdAt: new Date('2026-09-15T03:00:00.000Z'),
    updatedAt: new Date('2026-09-15T03:00:00.000Z'),
  };

  beforeEach(async () => {
    transactionsService = {
      create: jest.fn(),
      createTransfer: jest.fn(),
      findManyByUserId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      voidTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        {
          provide: TransactionsService,
          useValue: transactionsService,
        },
      ],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a transaction and map the response', async () => {
      transactionsService.create.mockResolvedValue(transaction);

      const dto = {
        accountId,
        categoryId: '44444444-4444-4444-8444-444444444444',
        type: 'EXPENSE',
        amount: 75000,
        transactionDate: '2026-09-15T10:00:00+07:00',
      };

      const result = await controller.create(userId, dto);

      expect(transactionsService.create).toHaveBeenCalledWith(userId, dto);

      expect(result).toEqual({
        id: transaction.id,
        userId: transaction.userId,
        accountId: transaction.accountId,
        categoryId: null,
        type: 'EXPENSE',
        amount: '75000.0000',
        currency: 'IDR',
        description: 'Lunch',
        transactionDate: transaction.transactionDate,
        source: 'MANUAL',
        status: 'ACTIVE',
        transferGroupId: null,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      });
    });
  });

  describe('createTransfer', () => {
    it('should create a transfer and map both transaction records', async () => {
      const transferResult = {
        transferGroupId,
        transactions: [
          {
            ...transaction,
            id: transactionId,
            accountId,
            type: 'TRANSFER',
            amount: {
              toString: () => '100000.0000',
            },
            transferGroupId,
            metadata: {
              direction: 'OUT',
            },
          },
          {
            ...transaction,
            id: '77777777-7777-4777-8777-777777777777',
            accountId: '33333333-3333-4333-8333-333333333333',
            type: 'TRANSFER',
            amount: {
              toString: () => '100000.0000',
            },
            transferGroupId,
            metadata: {
              direction: 'IN',
            },
          },
        ],
      };

      transactionsService.createTransfer.mockResolvedValue(transferResult);

      const dto = {
        sourceAccountId: accountId,
        destinationAccountId: '33333333-3333-4333-8333-333333333333',
        amount: 100000,
        transactionDate: '2026-09-15T10:00:00+07:00',
      };

      const result = await controller.createTransfer(userId, dto);

      expect(transactionsService.createTransfer).toHaveBeenCalledWith(
        userId,
        dto,
      );

      expect(result.transferGroupId).toBe(transferGroupId);

      expect(result.transactions).toHaveLength(2);

      expect(result.transactions[0]).toEqual(
        expect.objectContaining({
          id: transactionId,
          accountId,
          type: 'TRANSFER',
          amount: '100000.0000',
          transferGroupId,
        }),
      );

      expect(result.transactions[1]).toEqual(
        expect.objectContaining({
          type: 'TRANSFER',
          amount: '100000.0000',
          transferGroupId,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return mapped transactions and pagination metadata', async () => {
      transactionsService.findManyByUserId.mockResolvedValue({
        data: [transaction],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });

      const query = {
        page: 1,
        limit: 20,
      };

      const result = await controller.findAll(userId, query);

      expect(transactionsService.findManyByUserId).toHaveBeenCalledWith(
        userId,
        query,
      );

      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: transactionId,
          amount: '75000.0000',
          currency: 'IDR',
        }),
      );
    });

    it('should return an empty data array when there are no transactions', async () => {
      transactionsService.findManyByUserId.mockResolvedValue({
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      });

      const result = await controller.findAll(userId, {});

      expect(result).toEqual({
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return a mapped transaction', async () => {
      transactionsService.findById.mockResolvedValue(transaction);

      const result = await controller.findOne(userId, transactionId);

      expect(transactionsService.findById).toHaveBeenCalledWith(
        transactionId,
        userId,
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: transactionId,
          userId,
          accountId,
          amount: '75000.0000',
          currency: 'IDR',
        }),
      );
    });
  });

  describe('update', () => {
    it('should update a transaction and return mapped response', async () => {
      const dto = {
        amount: 125000,
        description: 'Updated lunch',
      };

      const updatedTransaction = {
        ...transaction,
        amount: {
          toString: () => '125000.0000',
        },
        description: 'Updated lunch',
      };

      transactionsService.update.mockResolvedValue(updatedTransaction);

      const result = await controller.update(userId, transactionId, dto);

      expect(transactionsService.update).toHaveBeenCalledWith(
        transactionId,
        userId,
        dto,
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: transactionId,
          amount: '125000.0000',
          description: 'Updated lunch',
        }),
      );
    });
  });

  describe('remove', () => {
    it('should void a transaction', async () => {
      const response = {
        message: 'Transaction voided successfully',
      };

      transactionsService.voidTransaction.mockResolvedValue(response);

      const result = await controller.remove(userId, transactionId);

      expect(transactionsService.voidTransaction).toHaveBeenCalledWith(
        transactionId,
        userId,
      );

      expect(result).toEqual(response);
    });
  });
});
