import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';

import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { RecurringTransactionsRepository } from './repositories/recurring-transactions.repository';
import { RecurringFrequency } from 'src/database/enums/recurring-frequency.enum';
import { GetRecurringTransactionsQueryDto } from './dto/get-recurring-transaction-query.dto';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto';
import { SetRecurringTransactionEnabledDto } from './dto/set-recurring-transaction-enabled.dto';

@Injectable()
export class RecurringTransactionsService {
  constructor(
    private readonly recurringTransactionsRepository: RecurringTransactionsRepository,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(userId: string, dto: CreateRecurringTransactionDto) {
    const startDate = this.parseDate(dto.startDate, 'startDate');
    const endDate = dto.endDate ? this.parseDate(dto.endDate, 'endDate') : null;

    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(
        'endDate must be greater than or equal to startDate',
      );
    }

    await this.accountsService.findById(dto.accountId, userId);

    if (dto.categoryId) {
      await this.categoriesService.findById(dto.categoryId, userId);
    }

    const nextRunAt = this.calculatedNextRunAt(startDate, dto.frequency);

    if (endDate && nextRunAt.getTime() > endDate.getTime()) {
      throw new BadRequestException('The calculated nextRunAt exceeds endDate');
    }

    return this.recurringTransactionsRepository.create({
      user: {
        connect: {
          id: userId,
        },
      },
      account: {
        connect: {
          id: dto.accountId,
        },
      },

      ...(dto.categoryId
        ? {
            category: {
              connect: {
                id: dto.categoryId,
              },
            },
          }
        : {}),
      type: dto.type,
      amount: dto.amount,
      description: dto.description?.trim() || null,
      frequency: dto.frequency,
      startDate,
      endDate,
      nextRunAt,
      lastRunAt: null,
      isActive: true,
    });
  }

  async findAll(userId: string, query: GetRecurringTransactionsQueryDto) {
    return this.recurringTransactionsRepository.findManyByUserId(userId, query);
  }

  async findById(userId: string, recurringTransactionId: string) {
    const recurringTransaction =
      await this.recurringTransactionsRepository.findByIdAndUserId(
        recurringTransactionId,
        userId,
      );

    if (!recurringTransaction) {
      throw new NotFoundException('Recurring transaction not found');
    }

    return recurringTransaction;
  }

  async update(
    userId: string,
    recurringTransactionId: string,
    dto: UpdateRecurringTransactionDto,
  ) {
    const existing =
      await this.recurringTransactionsRepository.findByIdAndUserId(
        recurringTransactionId,
        userId,
      );

    if (!existing) {
      throw new NotFoundException('Recurring transaction not found');
    }

    if (dto.accountId !== undefined) {
      await this.accountsService.findById(dto.accountId, userId);
    }

    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      await this.categoriesService.findById(dto.categoryId, userId);
    }

    const startDate =
      dto.startDate !== undefined
        ? this.parseDate(dto.startDate, 'startDate')
        : existing.startDate;

    const endDate =
      dto.endDate !== undefined
        ? dto.endDate === null
          ? null
          : this.parseDate(dto.endDate, 'endDate')
        : existing.endDate;

    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(
        'endDate must be greater than or equal to startDate',
      );
    }

    const frequency = dto.frequency ?? existing.frequency;

    const shouldRecalculateNextRunAt =
      dto.startDate !== undefined || dto.frequency !== undefined;

    const nextRunAt = shouldRecalculateNextRunAt
      ? this.calculatedNextRunAt(startDate, frequency)
      : existing.nextRunAt;

    if (endDate && nextRunAt.getTime() > endDate.getTime()) {
      throw new BadRequestException('The calculated nextRunAt exceeds endDate');
    }

    const updateData: Parameters<
      typeof this.recurringTransactionsRepository.update
    >[2] = {
      ...(dto.accountId !== undefined
        ? {
            account: {
              connect: {
                id: dto.accountId,
              },
            },
          }
        : {}),

      ...(dto.categoryId !== undefined
        ? dto.categoryId === null
          ? {
              category: {
                disconnect: true,
              },
            }
          : {
              category: {
                connect: {
                  id: dto.categoryId,
                },
              },
            }
        : {}),

      ...(dto.type !== undefined
        ? {
            type: dto.type,
          }
        : {}),

      ...(dto.amount !== undefined
        ? {
            amount: dto.amount,
          }
        : {}),

      ...(dto.description !== undefined
        ? {
            description:
              dto.description === null ? null : dto.description.trim() || null,
          }
        : {}),

      ...(dto.frequency !== undefined
        ? {
            frequency: dto.frequency,
          }
        : {}),

      ...(dto.startDate !== undefined
        ? {
            startDate,
          }
        : {}),

      ...(dto.endDate !== undefined
        ? {
            endDate,
          }
        : {}),

      ...(shouldRecalculateNextRunAt
        ? {
            nextRunAt,
          }
        : {}),
    };

    const result = await this.recurringTransactionsRepository.update(
      recurringTransactionId,
      userId,
      updateData,
    );

    if (result.count === 0) {
      throw new NotFoundException('Recurring transaction not found');
    }

    return this.findById(userId, recurringTransactionId);
  }

  async setEnabled(
    userId: string,
    recurringTransactionId: string,
    dto: SetRecurringTransactionEnabledDto,
  ) {
    const existing =
      await this.recurringTransactionsRepository.findByIdAndUserId(
        recurringTransactionId,
        userId,
      );

    if (!existing) {
      throw new NotFoundException('Recurring transaction not found');
    }

    if (existing.isActive === dto.isActive) {
      return existing;
    }

    const result = await this.recurringTransactionsRepository.setEnabled(
      recurringTransactionId,
      userId,
      dto.isActive,
    );

    if (result.count === 0) {
      throw new NotFoundException('Recurring transaction not found');
    }

    return this.findById(userId, recurringTransactionId);
  }

  async remove(userId: string, recurringTransactionId: string) {
    const existing =
      await this.recurringTransactionsRepository.findByIdAndUserId(
        recurringTransactionId,
        userId,
      );

    if (!existing) {
      throw new NotFoundException('Recurring transaction not found');
    }

    const result = await this.recurringTransactionsRepository.delete(
      recurringTransactionId,
      userId,
    );

    if (result.count === 0) {
      throw new NotFoundException('Recurring transaction not found');
    }

    return {
      message: 'Recurring transaction deleted successfully',
    };
  }

  private parseDate(value: string, fieldName: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }

    return date;
  }

  private calculatedNextRunAt(
    startDate: Date,
    frequency: RecurringFrequency,
  ): Date {
    const nextRunAt = new Date(startDate);

    switch (frequency) {
      case RecurringFrequency.DAILY:
        nextRunAt.setUTCDate(nextRunAt.getUTCDate() + 1);
        break;
      case RecurringFrequency.WEEKLY:
        nextRunAt.setUTCDate(nextRunAt.getUTCDate() + 7);
        break;
      case RecurringFrequency.MONTHLY:
        nextRunAt.setUTCMonth(nextRunAt.getUTCMonth() + 1);
        break;
      case RecurringFrequency.YEARLY:
        nextRunAt.setUTCFullYear(nextRunAt.getUTCFullYear() + 1);
        break;

      default:
        throw new BadRequestException(
          'Unsupported recurring transaction frequency',
        );
    }

    return nextRunAt;
  }

  async execute(userId: string, recurringTransactionId: string) {
    const recurringTransaction =
      await this.recurringTransactionsRepository.findByIdAndUserId(
        recurringTransactionId,
        userId,
      );

    if (!recurringTransaction) {
      throw new NotFoundException('Recurring transaction not found');
    }

    if (!recurringTransaction.isActive) {
      throw new BadRequestException('Recurring transaction is disabled');
    }

    const now = new Date();

    if (recurringTransaction.nextRunAt.getTime() > now.getTime()) {
      throw new BadRequestException('Recurring transaction is not due yet');
    }

    const scheduledAt = recurringTransaction.nextRunAt;
    const nextRunAt = this.calculatedNextRunAt(
      scheduledAt,
      recurringTransaction.frequency,
    );

    let shouldRemainActive = true;

    if (
      recurringTransaction.endDate &&
      nextRunAt.getTime() > recurringTransaction.endDate.getTime()
    ) {
      shouldRemainActive = false;
    }

    const result =
      await this.recurringTransactionsRepository.executeDueTransaction(
        recurringTransactionId,
        scheduledAt,
        shouldRemainActive ? nextRunAt : null,
        shouldRemainActive,
      );

    if (!result) {
      throw new BadRequestException(
        'Recurring transaction could not be excuted',
      );
    }

    return result;
  }
}
