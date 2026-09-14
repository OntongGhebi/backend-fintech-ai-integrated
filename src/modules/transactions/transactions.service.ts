import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';

import { TransactionSource } from 'src/database/enums/transaction-source.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

import { AccountsRepository } from '../accounts/repositories/accounts.repository';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { GetTransactionsQueryDto } from './dto/get-transaction-query.dto';
import { TransactionsRepository } from './repositories/transactions.repository';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
    private readonly accountsRepository: AccountsRepository,
  ) {}

  async create(userId: string, dto: CreateTransactionDto) {
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
      source: TransactionSource.MANUAL,
      status: 'ACTIVE',
      transferGroupId: null,
      metadata: Prisma.DbNull,
    });
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
}
