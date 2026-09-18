import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { BudgetStatus } from 'src/database/enums/budget-status.enum';

import { CategoriesService } from '../categories/categories.service';

import { CreateBudgetDto } from './dto/create-budget.dto';
import { BudgetsRepository } from './repositories/budgets.repository';
import { GetBudgetsQueryDto } from './dto/get-budgets-query.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

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
      await this.categoriesService.findById(dto.categoryId, userId);
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

  async findAll(userId: string, query: GetBudgetsQueryDto) {
    if (query.status) {
      return this.budgetsRepository.findManyByUserIdAndStatus(
        userId,
        query.status,
      );
    }

    return this.budgetsRepository.findManyByUserId(userId);
  }

  async findById(userId: string, budgetId: string) {
    const budget = await this.budgetsRepository.findByIdAndUserId(
      budgetId,
      userId,
    );

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    return budget;
  }

  async update(userId: string, budgetId: string, dto: UpdateBudgetDto) {
    const existingBudget = await this.budgetsRepository.findByIdAndUserId(
      budgetId,
      userId,
    );

    if (!existingBudget) {
      throw new NotFoundException('Budget not found');
    }

    const data: Parameters<typeof this.budgetsRepository.update>[2] = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      if (!name) {
        throw new BadRequestException('Budget name cannot be empty');
      }

      const duplicatedBudget =
        await this.budgetsRepository.findByNameAndUserIdExceptId(
          name,
          userId,
          budgetId,
        );

      if (duplicatedBudget) {
        throw new ConflictException('A budget with this name already exists');
      }
      data.name = name;
    }

    if (dto.amount !== undefined) {
      data.amount = dto.amount;
    }

    if (dto.period !== undefined) {
      data.period = dto.period;
    }

    let startDate = existingBudget.startDate;
    let endDate = existingBudget.endDate;

    if (dto.startDate !== undefined) {
      startDate = this.parseDate(dto.startDate, 'startDate');

      data.startDate = startDate;
    }
    if (dto.endDate !== undefined) {
      endDate = dto.endDate ? this.parseDate(dto.endDate, 'endDate') : null;

      data.endDate = endDate;
    }

    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(
        'endDate must be greater than or equal to startDate',
      );
    }

    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) {
        data.categoryId = null;
      } else {
        await this.categoriesService.findById(dto.categoryId, userId);

        data.categoryId = dto.categoryId;
      }
    }

    if (Object.keys(data).length === 0) {
      return this.findById(userId, budgetId);
    }

    await this.budgetsRepository.update(budgetId, userId, data);

    return this.findById(userId, budgetId);
  }

  async remove(userId: string, budgetId: string) {
    const existingBudget = await this.budgetsRepository.findByIdAndUserId(
      budgetId,
      userId,
    );

    if (!existingBudget) {
      throw new NotFoundException('Budget not found');
    }

    await this.budgetsRepository.softDalete(budgetId, userId);

    return {
      message: 'Budget archived successfully',
    };
  }

  private parseDate(value: string, fieldName: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }

    return date;
  }
}
