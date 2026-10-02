import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { TransactionSource } from 'src/database/enums/transaction-source.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';
import { Prisma } from '../../../generated/prisma/client.js';

import { AccountsRepository } from '../accounts/repositories/accounts.repository';

import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { GetTransactionsQueryDto } from './dto/get-transaction-query.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsRepository } from './repositories/transactions.repository';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;

  let transactionsRepository: jest.Mocked<TransactionsRepository>;
  let accountsRepository: jest.Mocked<AccountsRepository>;

  const userId = '11111111-1111-4111-8111-111111111111';

  const accountId = '22222222-2222-4222-8222-222222222222';
  const secondAccountId = '33333333-3333-4333-8333-333333333333';

  const categoryId = '44444444-4444-4444-8444-444444444444';

  const transactionId = '55555555-5555-4555-8555-555555555555';

  const transactionDate = '2026-09-15T10:00:00+07:00';

  const activeAccount = {
    id: accountId,
    userId,
    name: 'Main Bank',
    type: 'BANK',
    openingBalance: 1000000,
    currency: 'IDR',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const secondActiveAccount = {
    id: secondAccountId,
    userId,
    name: 'Savings',
    type: 'BANK',
    openingBalance: 500000,
    currency: 'IDR',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const incomeCategory = {
    id: categoryId,
    userId,
    name: 'Salary',
    type: 'INCOME',
    icon: null,
    color: null,
    isSystem: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const expenseCategory = {
    id: categoryId,
    userId,
    name: 'Food',
    type: 'EXPENSE',
    icon: null,
    color: null,
    isSystem: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const activeTransaction = {
    id: transactionId,
    userId,
    accountId,
    categoryId,
    type: TransactionType.EXPENSE,
    amount: 75000,
    currency: 'IDR',
    description: 'Lunch',
    transactionDate: new Date(transactionDate),
    source: TransactionSource.MANUAL,
    status: 'ACTIVE',
    transferGroupId: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    transactionsRepository = {
      create: jest.fn(),
      findByIdAndUserId: jest.fn(),
      findManyByUserId: jest.fn(),
      update: jest.fn(),
      voidTransaction: jest.fn(),
      findManyByTransferGroupId: jest.fn(),
      findCategoryByIdAndUserId: jest.fn(),
      createTransfer: jest.fn(),
    } as unknown as jest.Mocked<TransactionsRepository>;

    accountsRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUserId: jest.fn(),
      findManyByUserId: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<AccountsRepository>;

    service = new TransactionsService(
      transactionsRepository,
      accountsRepository,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto: CreateTransactionDto = {
      accountId,
      categoryId,
      type: TransactionType.EXPENSE,
      amount: 75000,
      currency: 'IDR',
      description: ' Lunch ',
      transactionDate,
    };

    it('should create an expense transaction successfully', async () => {
      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue(
        expenseCategory as never,
      );

      transactionsRepository.create.mockResolvedValue(
        activeTransaction as never,
      );

      const result = await service.create(userId, dto);

      expect(result).toEqual(activeTransaction);

      expect(accountsRepository.findByIdAndUserId).toHaveBeenCalledWith(
        accountId,
        userId,
      );

      expect(
        transactionsRepository.findCategoryByIdAndUserId,
      ).toHaveBeenCalledWith(categoryId, userId);

      expect(transactionsRepository.create).toHaveBeenCalledWith({
        userId,
        accountId,
        categoryId,
        type: TransactionType.EXPENSE,
        amount: 75000,
        currency: 'IDR',
        description: 'Lunch',
        transactionDate: new Date(transactionDate),
        source: TransactionSource.MANUAL,
        status: 'ACTIVE',
        transferGroupId: null,
        metadata: Prisma.DbNull,
      });
    });

    it('should create an income transaction successfully', async () => {
      const incomeDto: CreateTransactionDto = {
        accountId,
        categoryId,
        type: TransactionType.INCOME,
        amount: 5000000,
        transactionDate,
      };

      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue(
        incomeCategory as never,
      );

      transactionsRepository.create.mockResolvedValue(
        activeTransaction as never,
      );

      await service.create(userId, incomeDto);

      expect(transactionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          accountId,
          categoryId,
          type: TransactionType.INCOME,
          amount: 5000000,
          currency: 'IDR',
          source: TransactionSource.MANUAL,
        }),
      );
    });

    it('should reject when account does not belong to user', async () => {
      accountsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.create(userId, dto)).rejects.toThrow(
        new NotFoundException('Account not found'),
      );

      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject inactive account', async () => {
      accountsRepository.findByIdAndUserId.mockResolvedValue({
        ...activeAccount,
        isActive: false,
      } as never);

      await expect(service.create(userId, dto)).rejects.toThrow(
        new BadRequestException('Account is inactive'),
      );

      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject non-IDR account', async () => {
      accountsRepository.findByIdAndUserId.mockResolvedValue({
        ...activeAccount,
        currency: 'USD',
      } as never);

      await expect(service.create(userId, dto)).rejects.toThrow(
        new BadRequestException('Account currency must be IDR'),
      );

      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject transfer with category', async () => {
      const transferDto: CreateTransactionDto = {
        accountId,
        categoryId,
        type: TransactionType.TRANSFER,
        amount: 100000,
        transactionDate,
      };

      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      await expect(service.create(userId, transferDto)).rejects.toThrow(
        new BadRequestException('Transfer transaction cannot have a category'),
      );

      expect(
        transactionsRepository.findCategoryByIdAndUserId,
      ).not.toHaveBeenCalled();

      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('should create a transfer transaction without category', async () => {
      const transferDto: CreateTransactionDto = {
        accountId,
        type: TransactionType.TRANSFER,
        amount: 100000,
        transactionDate,
      };

      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      transactionsRepository.create.mockResolvedValue(
        activeTransaction as never,
      );

      await service.create(userId, transferDto);

      expect(
        transactionsRepository.findCategoryByIdAndUserId,
      ).not.toHaveBeenCalled();

      expect(transactionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: null,
          type: TransactionType.TRANSFER,
        }),
      );
    });

    it('should reject when category does not belong to user', async () => {
      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue(null);

      await expect(service.create(userId, dto)).rejects.toThrow(
        new NotFoundException('Category not found'),
      );

      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject inactive category', async () => {
      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue({
        ...expenseCategory,
        isActive: false,
      } as never);

      await expect(service.create(userId, dto)).rejects.toThrow(
        new BadRequestException('Category is inactive'),
      );

      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject expense transaction with income category', async () => {
      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue(
        incomeCategory as never,
      );

      await expect(service.create(userId, dto)).rejects.toThrow(
        new BadRequestException(
          'Expense transaction requires an expense category',
        ),
      );

      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject income transaction with expense category', async () => {
      const incomeDto: CreateTransactionDto = {
        accountId,
        categoryId,
        type: TransactionType.INCOME,
        amount: 5000000,
        transactionDate,
      };

      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue(
        expenseCategory as never,
      );

      await expect(service.create(userId, incomeDto)).rejects.toThrow(
        new BadRequestException(
          'Income transaction requires an income category',
        ),
      );

      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('should persist an AI transaction with AI source', async () => {
      const dto = {
        accountId: 'account-1',
        categoryId: 'category-1',
        type: TransactionType.EXPENSE,
        amount: 50000,
        description: 'makan siang',
        transactionDate: '2026-10-02T10:00:00.000Z',
      };

      accountsRepository.findByIdAndUserId.mockResolvedValue({
        id: 'account-1',
        userId: 'user-1',
        isActive: true,
        currency: 'IDR',
      });

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue({
        id: 'category-1',
        userId: 'user-1',
        type: 'EXPENSE',
        isActive: true,
        deletedAt: null,
      });

      transactionsRepository.create.mockResolvedValue({
        id: 'transaction-1',
        source: TransactionSource.AI,
      });

      const result = await service.create('user-1', dto, TransactionSource.AI);

      expect(transactionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: TransactionSource.AI,
        }),
      );

      expect(result).toEqual({
        id: 'transaction-1',
        source: TransactionSource.AI,
      });
    });
  });

  describe('createTransfer', () => {
    const dto: CreateTransferDto = {
      sourceAccountId: accountId,
      destinationAccountId: secondAccountId,
      amount: 100000,
      description: ' Transfer to savings ',
      transactionDate,
    };

    it('should create an atomic transfer between two accounts', async () => {
      accountsRepository.findByIdAndUserId
        .mockResolvedValueOnce(activeAccount as never)
        .mockResolvedValueOnce(secondActiveAccount as never);

      const sourceTransaction = {
        ...activeTransaction,
        accountId,
        categoryId: null,
        type: TransactionType.TRANSFER,
        amount: 100000,
        transferGroupId: '66666666-6666-4666-8666-666666666666',
        metadata: {
          direction: 'OUT',
        },
      };

      const destinationTransaction = {
        ...activeTransaction,
        id: '77777777-7777-4777-8777-777777777777',
        accountId: secondAccountId,
        categoryId: null,
        type: TransactionType.TRANSFER,
        amount: 100000,
        transferGroupId: sourceTransaction.transferGroupId,
        metadata: {
          direction: 'IN',
        },
      };

      transactionsRepository.createTransfer.mockResolvedValue({
        sourceTransaction,
        destinationTransaction,
      } as never);

      const result = await service.createTransfer(userId, dto);

      expect(result.transferGroupId).toEqual(expect.any(String));
      expect(result.transferGroupId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      expect(result.transactions).toHaveLength(2);

      expect(accountsRepository.findByIdAndUserId).toHaveBeenNthCalledWith(
        1,
        accountId,
        userId,
      );

      expect(accountsRepository.findByIdAndUserId).toHaveBeenNthCalledWith(
        2,
        secondAccountId,
        userId,
      );

      expect(transactionsRepository.createTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          accountId,
          categoryId: null,
          type: TransactionType.TRANSFER,
          amount: 100000,
          currency: 'IDR',
          source: TransactionSource.MANUAL,
          status: 'ACTIVE',
          metadata: {
            direction: 'OUT',
          },
        }),
        expect.objectContaining({
          userId,
          accountId: secondAccountId,
          categoryId: null,
          type: TransactionType.TRANSFER,
          amount: 100000,
          currency: 'IDR',
          source: TransactionSource.MANUAL,
          status: 'ACTIVE',
          metadata: {
            direction: 'IN',
          },
        }),
      );
    });

    it('should reject transfer between the same account', async () => {
      const sameAccountDto: CreateTransferDto = {
        ...dto,
        destinationAccountId: accountId,
      };

      await expect(
        service.createTransfer(userId, sameAccountDto),
      ).rejects.toThrow(
        new BadRequestException(
          'Source and destination accounts must be different',
        ),
      );

      expect(accountsRepository.findByIdAndUserId).not.toHaveBeenCalled();

      expect(transactionsRepository.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject when source account does not belong to user', async () => {
      accountsRepository.findByIdAndUserId.mockResolvedValueOnce(null);

      await expect(service.createTransfer(userId, dto)).rejects.toThrow(
        new NotFoundException('Source account not found'),
      );

      expect(transactionsRepository.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject when destination account does not belong to user', async () => {
      accountsRepository.findByIdAndUserId
        .mockResolvedValueOnce(activeAccount as never)
        .mockResolvedValueOnce(null);

      await expect(service.createTransfer(userId, dto)).rejects.toThrow(
        new NotFoundException('Destination account not found'),
      );

      expect(transactionsRepository.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject inactive source account', async () => {
      accountsRepository.findByIdAndUserId
        .mockResolvedValueOnce({
          ...activeAccount,
          isActive: false,
        } as never)
        .mockResolvedValueOnce(secondActiveAccount as never);

      await expect(service.createTransfer(userId, dto)).rejects.toThrow(
        new BadRequestException('Source account is inactive'),
      );

      expect(transactionsRepository.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject inactive destination account', async () => {
      accountsRepository.findByIdAndUserId
        .mockResolvedValueOnce(activeAccount as never)
        .mockResolvedValueOnce({
          ...secondActiveAccount,
          isActive: false,
        } as never);

      await expect(service.createTransfer(userId, dto)).rejects.toThrow(
        new BadRequestException('Destination account is inactive'),
      );

      expect(transactionsRepository.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject non-IDR source account', async () => {
      accountsRepository.findByIdAndUserId
        .mockResolvedValueOnce({
          ...activeAccount,
          currency: 'USD',
        } as never)
        .mockResolvedValueOnce(secondActiveAccount as never);

      await expect(service.createTransfer(userId, dto)).rejects.toThrow(
        new BadRequestException('Source account currency must be IDR'),
      );

      expect(transactionsRepository.createTransfer).not.toHaveBeenCalled();
    });

    it('should reject non-IDR destination account', async () => {
      accountsRepository.findByIdAndUserId
        .mockResolvedValueOnce(activeAccount as never)
        .mockResolvedValueOnce({
          ...secondActiveAccount,
          currency: 'USD',
        } as never);

      await expect(service.createTransfer(userId, dto)).rejects.toThrow(
        new BadRequestException('Destination account currency must be IDR'),
      );

      expect(transactionsRepository.createTransfer).not.toHaveBeenCalled();
    });

    it('should persist an AI transfer with AI source', async () => {
      const dto = {
        sourceAccountId: 'account-1',
        destinationAccountId: 'account-2',
        amount: 100000,
        description: 'transfer ke tabungan',
        transactionDate: '2026-10-02T10:00:00.000Z',
      };

      accountsRepository.findByIdAndUserId
        .mockResolvedValueOnce({
          id: 'account-1',
          userId: 'user-1',
          isActive: true,
          currency: 'IDR',
        })
        .mockResolvedValueOnce({
          id: 'account-2',
          userId: 'user-1',
          isActive: true,
          currency: 'IDR',
        });

      transactionsRepository.createTransfer.mockResolvedValue({
        sourceTransaction: {
          id: 'transaction-source',
          source: TransactionSource.AI,
        },
        destinationTransaction: {
          id: 'transaction-destination',
          source: TransactionSource.AI,
        },
      });

      const result = await service.createTransfer(
        'user-1',
        dto,
        TransactionSource.AI,
      );

      expect(transactionsRepository.createTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          source: TransactionSource.AI,
        }),
        expect.objectContaining({
          source: TransactionSource.AI,
        }),
      );

      expect(result.transferGroupId).toEqual(expect.any(String));

      expect(result.transactions).toHaveLength(2);
    });
  });

  describe('findManyByUserId', () => {
    it('should return paginated transactions', async () => {
      const query: GetTransactionsQueryDto = {
        page: 1,
        limit: 20,
        type: TransactionType.EXPENSE,
        accountId,
      };

      const repositoryResult = {
        data: [activeTransaction],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      transactionsRepository.findManyByUserId.mockResolvedValue(
        repositoryResult as never,
      );

      const result = await service.findManyByUserId(userId, query);

      expect(result).toEqual(repositoryResult);

      expect(transactionsRepository.findManyByUserId).toHaveBeenCalledWith(
        userId,
        query,
      );
    });

    it('should reject when startDate is after endDate', async () => {
      const query: GetTransactionsQueryDto = {
        startDate: '2026-09-20T00:00:00+07:00',
        endDate: '2026-09-10T00:00:00+07:00',
      };

      await expect(service.findManyByUserId(userId, query)).rejects.toThrow(
        new BadRequestException(
          'startDate must be earlier than or equal to endDate',
        ),
      );

      expect(transactionsRepository.findManyByUserId).not.toHaveBeenCalled();
    });

    it('should allow equal startDate and endDate', async () => {
      const query: GetTransactionsQueryDto = {
        startDate: '2026-09-15T00:00:00+07:00',
        endDate: '2026-09-15T00:00:00+07:00',
      };

      const repositoryResult = {
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      };

      transactionsRepository.findManyByUserId.mockResolvedValue(
        repositoryResult as never,
      );

      await expect(service.findManyByUserId(userId, query)).resolves.toEqual(
        repositoryResult,
      );
    });
  });

  describe('findById', () => {
    it('should return transaction owned by user', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      const result = await service.findById(transactionId, userId);

      expect(result).toEqual(activeTransaction);

      expect(transactionsRepository.findByIdAndUserId).toHaveBeenCalledWith(
        transactionId,
        userId,
      );
    });

    it('should reject transaction owned by another user', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(transactionId, userId)).rejects.toThrow(
        new NotFoundException('Transaction not found'),
      );
    });
  });

  describe('update', () => {
    const dto: UpdateTransactionDto = {
      accountId,
      categoryId,
      amount: 125000,
      description: ' Updated lunch ',
      transactionDate: '2026-09-15T12:00:00+07:00',
    };

    it('should update an active transaction', async () => {
      transactionsRepository.findByIdAndUserId
        .mockResolvedValueOnce(activeTransaction as never)
        .mockResolvedValueOnce({
          ...activeTransaction,
          amount: 125000,
          description: 'Updated lunch',
        } as never);

      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue(
        expenseCategory as never,
      );

      transactionsRepository.update.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.update(transactionId, userId, dto);

      expect(transactionsRepository.update).toHaveBeenCalledWith(
        transactionId,
        userId,
        expect.objectContaining({
          accountId,
          categoryId,
          amount: 125000,
          description: 'Updated lunch',
          transactionDate: new Date('2026-09-15T12:00:00+07:00'),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          amount: 125000,
          description: 'Updated lunch',
        }),
      );
    });

    it('should reject transaction that does not belong to user', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.update(transactionId, userId, dto)).rejects.toThrow(
        new NotFoundException('Transaction not found'),
      );

      expect(transactionsRepository.update).not.toHaveBeenCalled();
    });

    it('should reject update of a voided transaction', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue({
        ...activeTransaction,
        status: 'VOIDED',
      } as never);

      await expect(service.update(transactionId, userId, dto)).rejects.toThrow(
        new BadRequestException('Voided transaction cannot be updated'),
      );

      expect(transactionsRepository.update).not.toHaveBeenCalled();
    });

    it('should reject when new account does not belong to user', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      accountsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.update(transactionId, userId, {
          accountId: secondAccountId,
        }),
      ).rejects.toThrow(new NotFoundException('Account not found'));

      expect(transactionsRepository.update).not.toHaveBeenCalled();
    });

    it('should reject inactive new account', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      accountsRepository.findByIdAndUserId.mockResolvedValue({
        ...activeAccount,
        isActive: false,
      } as never);

      await expect(
        service.update(transactionId, userId, {
          accountId: secondAccountId,
        }),
      ).rejects.toThrow(new BadRequestException('Account is inactive'));
    });

    it('should reject non-IDR new account', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      accountsRepository.findByIdAndUserId.mockResolvedValue({
        ...activeAccount,
        currency: 'USD',
      } as never);

      await expect(
        service.update(transactionId, userId, {
          accountId: secondAccountId,
        }),
      ).rejects.toThrow(
        new BadRequestException('Account currency must be IDR'),
      );
    });

    it('should reject when new category does not belong to user', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.update(transactionId, userId, {
          categoryId,
        }),
      ).rejects.toThrow(new NotFoundException('Category not found'));
    });

    it('should reject inactive new category', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue({
        ...expenseCategory,
        isActive: false,
      } as never);

      await expect(
        service.update(transactionId, userId, {
          categoryId,
        }),
      ).rejects.toThrow(new BadRequestException('Category is inactive'));
    });

    it('should reject category type mismatch', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      transactionsRepository.findCategoryByIdAndUserId.mockResolvedValue(
        incomeCategory as never,
      );

      await expect(
        service.update(transactionId, userId, {
          categoryId,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Expense transaction requires an expense category',
        ),
      );
    });

    it('should reject update when no fields are provided', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      await expect(service.update(transactionId, userId, {})).rejects.toThrow(
        new BadRequestException(
          'At least one field must be provided for update',
        ),
      );

      expect(transactionsRepository.update).not.toHaveBeenCalled();
    });

    it('should reject when repository updates zero records', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      accountsRepository.findByIdAndUserId.mockResolvedValue(
        activeAccount as never,
      );

      transactionsRepository.update.mockResolvedValue({
        count: 0,
      } as never);

      await expect(
        service.update(transactionId, userId, {
          amount: 100000,
        }),
      ).rejects.toThrow(new NotFoundException('Transaction not found'));
    });
  });

  describe('voidTransaction', () => {
    it('should void an active transaction', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      transactionsRepository.voidTransaction.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.voidTransaction(transactionId, userId);

      expect(result).toEqual({
        message: 'Transaction voided successfully',
      });

      expect(transactionsRepository.voidTransaction).toHaveBeenCalledWith(
        transactionId,
        userId,
      );
    });

    it('should reject transaction that does not belong to user', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.voidTransaction(transactionId, userId),
      ).rejects.toThrow(new NotFoundException('Transaction not found'));

      expect(transactionsRepository.voidTransaction).not.toHaveBeenCalled();
    });

    it('should reject an already voided transaction', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue({
        ...activeTransaction,
        status: 'VOIDED',
      } as never);

      await expect(
        service.voidTransaction(transactionId, userId),
      ).rejects.toThrow(
        new BadRequestException('Transaction is already voided'),
      );

      expect(transactionsRepository.voidTransaction).not.toHaveBeenCalled();
    });

    it('should reject when repository updates zero records', async () => {
      transactionsRepository.findByIdAndUserId.mockResolvedValue(
        activeTransaction as never,
      );

      transactionsRepository.voidTransaction.mockResolvedValue({
        count: 0,
      } as never);

      await expect(
        service.voidTransaction(transactionId, userId),
      ).rejects.toThrow(new NotFoundException('Transaction not found'));
    });
  });
});
