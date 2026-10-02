import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import * as crypto from 'node:crypto';

import { TransactionSource } from 'src/database/enums/transaction-source.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

import { AccountsRepository } from '../accounts/repositories/accounts.repository';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { GetTransactionsQueryDto } from './dto/get-transaction-query.dto';
import { TransactionsRepository } from './repositories/transactions.repository';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';

type TransactionTypeValue = 'INCOME' | 'EXPENSE' | 'TRANSFER';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
    private readonly accountsRepository: AccountsRepository,
  ) {}

  async create(
    userId: string,
    dto: CreateTransactionDto,
    source: TransactionSource = TransactionSource.MANUAL,
  ) {
    const account = await this.accountsRepository.findByIdAndUserId(
      dto.accountId,
      userId,
    );

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (!account.isActive) {
      throw new BadRequestException('Account is inactive');
    }

    if (account.currency !== 'IDR') {
      throw new BadRequestException('Account currency must be IDR');
    }

    if (dto.type === TransactionType.TRANSFER && dto.categoryId) {
      throw new BadRequestException(
        'Transfer transaction cannot have a category',
      );
    }

    if (dto.categoryId) {
      const category =
        await this.transactionsRepository.findCategoryByIdAndUserId(
          dto.categoryId,
          userId,
        );

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      if (!category.isActive || category.deletedAt) {
        throw new BadRequestException('Category is inactive');
      }

      if (dto.type === TransactionType.INCOME && category.type !== 'INCOME') {
        throw new BadRequestException(
          'Income transaction requires an income category',
        );
      }

      if (dto.type === TransactionType.EXPENSE && category.type !== 'EXPENSE') {
        throw new BadRequestException(
          'Expense transaction requires an expense category',
        );
      }
    }

    return this.transactionsRepository.create({
      userId,
      accountId: dto.accountId,
      categoryId: dto.categoryId ?? null,
      type: dto.type,
      amount: dto.amount,
      currency: 'IDR',
      description: dto.description?.trim() || null,
      transactionDate: new Date(dto.transactionDate),
      source,
      status: 'ACTIVE',
      transferGroupId: null,
      metadata: Prisma.DbNull,
    });
  }

  /**
   * Internal transaction creation entry point.
   *
   * This method is intentionally separate from the HTTP
   * CreateTransactionDto flow because system-generated
   * transactions must use TransactionSource.SYSTEM.
   *
   * The actual recurring execution remains responsible
   * for atomic execution with the recurring transaction
   * state update.
   */
  async createSystemTransaction(params: {
    userId: string;
    accountId: string;
    categoryId?: string | null;
    type: TransactionType;
    amount: number | string;
    transactionDate: Date;
    description?: string | null;
    metadata?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  }) {
    const account = await this.accountsRepository.findByIdAndUserId(
      params.accountId,
      params.userId,
    );

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (!account.isActive) {
      throw new BadRequestException('Account is inactive');
    }

    if (account.currency !== 'IDR') {
      throw new BadRequestException('Account currency must be IDR');
    }

    if (params.type === TransactionType.TRANSFER && params.categoryId) {
      throw new BadRequestException(
        'Transfer transaction cannot have a category',
      );
    }

    if (params.categoryId) {
      await this.validateCategory(
        params.categoryId,
        params.userId,
        params.type,
      );
    }

    return this.transactionsRepository.create({
      userId: params.userId,
      accountId: params.accountId,
      categoryId: params.categoryId ?? null,
      type: params.type,
      amount: params.amount,
      currency: 'IDR',
      description: params.description?.trim() || null,
      transactionDate: params.transactionDate,
      source: TransactionSource.SYSTEM,
      status: 'ACTIVE',
      transferGroupId: null,
      metadata: params.metadata ?? Prisma.DbNull,
    });
  }

  private async validateCategory(
    categoryId: string,
    userId: string,
    type: TransactionTypeValue,
  ) {
    const category =
      await this.transactionsRepository.findCategoryByIdAndUserId(
        categoryId,
        userId,
      );

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!category.isActive || category.deletedAt) {
      throw new BadRequestException('Category is inactive');
    }

    if (type === 'INCOME' && category.type !== 'INCOME') {
      throw new BadRequestException(
        'Income transaction requires an income category',
      );
    }

    if (type === 'EXPENSE' && category.type !== 'EXPENSE') {
      throw new BadRequestException(
        'Expense transaction requires an expense category',
      );
    }

    if (type === 'TRANSFER') {
      throw new BadRequestException(
        'Transfer transaction cannot have a category',
      );
    }

    return category;
  }

  async findManyByUserId(userId: string, query: GetTransactionsQueryDto) {
    if (
      query.startDate &&
      query.endDate &&
      new Date(query.startDate) > new Date(query.endDate)
    ) {
      throw new BadRequestException(
        'startDate must be earlier than or equal to endDate',
      );
    }

    return this.transactionsRepository.findManyByUserId(userId, query);
  }

  async findById(transactionId: string, userId: string) {
    const transaction = await this.transactionsRepository.findByIdAndUserId(
      transactionId,
      userId,
    );

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async update(
    transactionId: string,
    userId: string,
    dto: UpdateTransactionDto,
  ) {
    const transaction = await this.transactionsRepository.findByIdAndUserId(
      transactionId,
      userId,
    );

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== 'ACTIVE') {
      throw new BadRequestException('Voided transaction cannot be updated');
    }

    if (dto.accountId !== undefined) {
      const account = await this.accountsRepository.findByIdAndUserId(
        dto.accountId,
        userId,
      );

      if (!account) {
        throw new NotFoundException('Account not found');
      }

      if (!account.isActive) {
        throw new BadRequestException('Account is inactive');
      }

      if (account.currency !== 'IDR') {
        throw new BadRequestException('Account currency must be IDR');
      }
    }

    if (dto.categoryId !== undefined) {
      await this.validateCategory(dto.categoryId, userId, transaction.type);
    }

    const data: {
      accountId?: string;
      categoryId?: string | null;
      amount?: number;
      description?: string | null;
      transactionDate?: Date;
    } = {};

    if (dto.accountId !== undefined) {
      data.accountId = dto.accountId;
    }

    if (dto.categoryId !== undefined) {
      data.categoryId = dto.categoryId;
    }

    if (dto.amount !== undefined) {
      data.amount = dto.amount;
    }

    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (dto.transactionDate !== undefined) {
      data.transactionDate = new Date(dto.transactionDate);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'At least one field must be provided for update',
      );
    }

    const updated = await this.transactionsRepository.update(
      transactionId,
      userId,
      data,
    );

    if (updated.count === 0) {
      throw new NotFoundException('Transaction not found');
    }

    const result = await this.transactionsRepository.findByIdAndUserId(
      transactionId,
      userId,
    );

    if (!result) {
      throw new NotFoundException('Transaction not found');
    }

    return result;
  }

  async voidTransaction(transactionId: string, userId: string) {
    const transaction = await this.transactionsRepository.findByIdAndUserId(
      transactionId,
      userId,
    );

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== 'ACTIVE') {
      throw new BadRequestException('Transaction is already voided');
    }

    const result = await this.transactionsRepository.voidTransaction(
      transactionId,
      userId,
    );

    if (result.count === 0) {
      throw new NotFoundException('Transaction not found');
    }

    return {
      message: 'Transaction voided successfully',
    };
  }

  async createTransfer(
    userId: string,
    dto: CreateTransferDto,
    source: TransactionSource = TransactionSource.MANUAL,
  ) {
    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new BadRequestException(
        'Source and destination accounts must be different',
      );
    }

    const sourceAccount = await this.accountsRepository.findByIdAndUserId(
      dto.sourceAccountId,
      userId,
    );

    if (!sourceAccount) {
      throw new NotFoundException('Source account not found');
    }

    const destinationAccount = await this.accountsRepository.findByIdAndUserId(
      dto.destinationAccountId,
      userId,
    );

    if (!destinationAccount) {
      throw new NotFoundException('Destination account not found');
    }

    if (!sourceAccount.isActive) {
      throw new BadRequestException('Source account is inactive');
    }

    if (!destinationAccount.isActive) {
      throw new BadRequestException('Destination account is inactive');
    }

    if (sourceAccount.currency !== 'IDR') {
      throw new BadRequestException('Source account currency must be IDR');
    }

    if (destinationAccount.currency !== 'IDR') {
      throw new BadRequestException('Destination account currency must be IDR');
    }

    const transferGroupId = crypto.randomUUID();

    const transactionDate = new Date(dto.transactionDate);

    const description = dto.description?.trim() || null;

    const result = await this.transactionsRepository.createTransfer(
      {
        userId,
        accountId: dto.sourceAccountId,
        categoryId: null,
        type: TransactionType.TRANSFER,
        amount: dto.amount,
        currency: 'IDR',
        description,
        transactionDate,
        source,
        status: 'ACTIVE',
        transferGroupId,
        metadata: {
          direction: 'OUT',
        },
      },
      {
        userId,
        accountId: dto.destinationAccountId,
        categoryId: null,
        type: TransactionType.TRANSFER,
        amount: dto.amount,
        currency: 'IDR',
        description,
        transactionDate,
        source,
        status: 'ACTIVE',
        transferGroupId,
        metadata: {
          direction: 'IN',
        },
      },
    );

    return {
      transferGroupId,
      transactions: [result.sourceTransaction, result.destinationTransaction],
    };
  }
}
