import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { BudgetStatus } from 'src/database/enums/budget-status.enum';

import { CategoriesService } from '../categories/categories.service';

import { CreateBudgetDto } from './dto/create-budget.dto';
import { BudgetsRepository } from './repositories/budgets.repository';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly budgetsRepository: BudgetsRepository,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(userId: string, dto: CreateBudgetDto) {
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Budget name cannot be empty');
    }

    const startDate = this.parseDate(dto.startDate, 'startDate');

    const endDate = dto.endDate ? this.parseDate(dto.endDate, 'endDate') : null;

    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(
        'endDate must be greater than or equal to startDate',
      );
    }

    const existingBudget = await this.budgetsRepository.findByNameAndUserId(
      name,
      userId,
    );

    if (existingBudget) {
      throw new ConflictException('A budget with this name already exists');
    }

    if (dto.categoryId) {
      await this.categoriesService.findById(userId, dto.categoryId);
    }

    return this.budgetsRepository.create({
      user: {
        connect: {
          id: userId,
        },
      },
      name,
      amount: dto.amount,
      period: dto.period,
      startDate,
      endDate,
      status: BudgetStatus.ACTIVE,
      ...(dto.categoryId
        ? {
            category: {
              connect: {
                id: dto.categoryId,
              },
            },
          }
        : {}),
    });
  }

  private parseDate(value: string, fieldName: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }

    return date;
  }
}
