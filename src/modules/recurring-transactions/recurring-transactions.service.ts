import { Injectable, BadRequestException } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';

import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { RecurringTransactionsRepository } from './repositories/recurring-transactions.repository';
import { RecurringFrequency } from 'src/database/enums/recurring-frequency.enum';

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
}
