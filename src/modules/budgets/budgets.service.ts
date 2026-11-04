import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { BudgetStatus } from 'src/database/enums/budget-status.enum';

import { CategoriesService } from '../categories/categories.service';

import { CreateBudgetDto } from './dto/create-budget.dto';
import {
  BudgetsRepository,
  BudgetAllocationInput,
} from './repositories/budgets.repository';
import { GetBudgetsQueryDto } from './dto/get-budgets-query.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { UpdateBudgetStatusDto } from './dto/update-budget-status.dto';

@Injectable()
export class BudgetsService {
  private static readonly DEFAULT_FUTURE_MONTHS = 12;
  private static readonly MAX_FUTURE_MONTHS = 24;
  private static readonly TIME_ZONE = 'Asia/Jakarta';

  constructor(
    private readonly budgetsRepository: BudgetsRepository,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(userId: string, dto: CreateBudgetDto) {
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Budget name cannot be empty');
    }

    this.assertPositiveAmount(dto.amount, 'amount');

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

    const initialPeriodStart = this.firstDayOfMonth(startDate);

    return this.budgetsRepository.createWithInitialAllocation(
      {
        user: { connect: { id: userId } },
        name,
        amount: dto.amount,
        period: dto.period,
        startDate,
        endDate,
        status: BudgetStatus.ACTIVE,
        ...(dto.categoryId
          ? { category: { connect: { id: dto.categoryId } } }
          : {}),
      },
      initialPeriodStart,
      dto.amount,
    );
  }

  async findAll(userId: string, query: GetBudgetsQueryDto) {
    const periodStart = query.month
      ? this.parseMonth(query.month, 'month')
      : undefined;

    if (query.status) {
      return this.budgetsRepository.findManyByUserIdAndStatus(
        userId,
        query.status,
        periodStart,
      );
    }

    return this.budgetsRepository.findManyByUserId(userId, periodStart);
  }

  async findById(
    userId: string,
    budgetId: string,
    query: GetBudgetsQueryDto = {},
  ) {
    const periodStart = query.month
      ? this.parseMonth(query.month, 'month')
      : undefined;

    const budget = await this.budgetsRepository.findByIdAndUserId(
      budgetId,
      userId,
      periodStart,
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

    this.validateAllocationUpdateContract(dto);

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
        Object.assign(data, { categoryId: null });
      } else {
        await this.categoriesService.findById(dto.categoryId, userId);
        Object.assign(data, { categoryId: dto.categoryId });
      }
    }

    if (dto.amount !== undefined) {
      this.assertPositiveAmount(dto.amount, 'amount');

      const periodStart = this.parseMonth(dto.periodStart!, 'periodStart');
      this.assertCurrentOrFutureMonth(periodStart);
      this.assertAllocationWithinBudget(periodStart, startDate, endDate);

      const allocations = this.buildAllocations(
        periodStart,
        dto.amount,
        dto.applyToFuture === true,
        dto.futureMonths,
        endDate,
      );

      // Compatibility snapshot only. BudgetAllocation is the source of truth.
      data.amount = dto.amount;

      const updatedBudget = await this.budgetsRepository.updateWithAllocations(
        budgetId,
        userId,
        data,
        allocations,
      );

      if (!updatedBudget) {
        throw new NotFoundException('Budget not found');
      }

      return updatedBudget;
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

    await this.budgetsRepository.softDelete(budgetId, userId);

    return { message: 'Budget archived successfully' };
  }

  async updateStatus(
    userId: string,
    budgetId: string,
    dto: UpdateBudgetStatusDto,
  ) {
    const existingBudget = await this.budgetsRepository.findByIdAndUserId(
      budgetId,
      userId,
    );

    if (!existingBudget) {
      throw new NotFoundException('Budget not found');
    }

    if (String(existingBudget.status) === String(dto.status)) {
      return existingBudget;
    }

    await this.budgetsRepository.update(budgetId, userId, {
      status: dto.status,
    });

    return this.findById(userId, budgetId);
  }

  private validateAllocationUpdateContract(dto: UpdateBudgetDto): void {
    if (dto.amount !== undefined && !dto.periodStart) {
      throw new BadRequestException(
        'periodStart is required when updating amount',
      );
    }

    if (dto.amount === undefined && dto.periodStart !== undefined) {
      throw new BadRequestException(
        'periodStart can only be provided when amount is updated',
      );
    }

    if (
      dto.amount === undefined &&
      (dto.applyToFuture !== undefined || dto.futureMonths !== undefined)
    ) {
      throw new BadRequestException(
        'applyToFuture and futureMonths require an amount update',
      );
    }

    if (dto.futureMonths !== undefined && dto.applyToFuture !== true) {
      throw new BadRequestException(
        'futureMonths can only be used when applyToFuture is true',
      );
    }

    if (dto.applyToFuture === true && dto.amount === undefined) {
      throw new BadRequestException(
        'amount is required when applyToFuture is true',
      );
    }
  }

  private buildAllocations(
    periodStart: Date,
    amount: string,
    applyToFuture: boolean,
    requestedMonths: number | undefined,
    endDate: Date | null,
  ): BudgetAllocationInput[] {
    const months = applyToFuture
      ? (requestedMonths ?? BudgetsService.DEFAULT_FUTURE_MONTHS)
      : 1;

    if (months < 1 || months > BudgetsService.MAX_FUTURE_MONTHS) {
      throw new BadRequestException(
        `futureMonths must be between 1 and ${BudgetsService.MAX_FUTURE_MONTHS}`,
      );
    }

    const allocations: BudgetAllocationInput[] = [];

    for (let offset = 0; offset < months; offset += 1) {
      const month = new Date(
        Date.UTC(
          periodStart.getUTCFullYear(),
          periodStart.getUTCMonth() + offset,
          1,
        ),
      );

      if (
        endDate &&
        month.getTime() > this.firstDayOfMonth(endDate).getTime()
      ) {
        if (requestedMonths !== undefined) {
          throw new BadRequestException(
            'futureMonths exceeds the budget endDate range',
          );
        }
        break;
      }

      allocations.push({ periodStart: month, amount });
    }

    return allocations;
  }

  private assertAllocationWithinBudget(
    periodStart: Date,
    startDate: Date,
    endDate: Date | null,
  ): void {
    if (periodStart.getTime() < this.firstDayOfMonth(startDate).getTime()) {
      throw new BadRequestException(
        'periodStart cannot be earlier than the budget startDate month',
      );
    }

    if (
      endDate &&
      periodStart.getTime() > this.firstDayOfMonth(endDate).getTime()
    ) {
      throw new BadRequestException(
        'periodStart cannot be later than the budget endDate month',
      );
    }
  }

  private assertCurrentOrFutureMonth(periodStart: Date): void {
    const currentMonth = this.currentMonthStart();

    if (periodStart.getTime() < currentMonth.getTime()) {
      throw new BadRequestException(
        'Historical budget allocations cannot be modified',
      );
    }
  }

  private currentMonthStart(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BudgetsService.TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());

    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);

    return new Date(Date.UTC(year, month - 1, 1));
  }

  private firstDayOfMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private parseMonth(value: string, fieldName: string): Date {
    if (!/^\d{4}-\d{2}-01$/.test(value)) {
      throw new BadRequestException(
        `${fieldName} must be the first day of a month (YYYY-MM-01)`,
      );
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`${fieldName} must be a valid month`);
    }

    return date;
  }

  private parseDate(value: string, fieldName: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }

    return date;
  }

  private assertPositiveAmount(value: string, fieldName: string): void {
    if (!/^(?=.*[1-9])\d+(\.\d{1,4})?$/.test(value)) {
      throw new BadRequestException(
        `${fieldName} must be greater than zero and have up to 4 decimal places`,
      );
    }
  }
}
