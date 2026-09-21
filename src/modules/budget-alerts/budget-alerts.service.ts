import { Injectable, NotFoundException } from '@nestjs/common';
import { BudgetAlertsRepository } from './repositories/budget-alerts.repository';
import { BudgetsService } from '../budgets/budgets.service';
import { CreateBudgetAlertDto } from './dto/create-budget-alert.dto';
import { GetBudgetAlertsQueryDto } from './dto/get-budget-alerts-query.dto';
import { UpdateBudgetAlertDto } from './dto/update-budget-alert.dto';

@Injectable()
export class BudgetAlertsService {
  constructor(
    private readonly budgetAlertsRepository: BudgetAlertsRepository,
    private readonly budgetsService: BudgetsService,
  ) {}

  async create(userId: string, budgetId: string, dto: CreateBudgetAlertDto) {
    await this.budgetsService.findById(userId, budgetId);

    return this.budgetAlertsRepository.create({
      budget: {
        connect: {
          id: budgetId,
        },
      },
      thresholdPercentage: dto.thresholdPercentage,
      channel: dto.channel,
      isEnabled: true,
    });
  }

  async findAll(userId: string, query: GetBudgetAlertsQueryDto) {
    return this.budgetAlertsRepository.findManyByUserId(userId, {
      channel: query.channel,
      isEnabled: query.isEnabled,
    });
  }

  async findAllByBudget(
    userId: string,
    budgetId: string,
    query: GetBudgetAlertsQueryDto,
  ) {
    await this.budgetsService.findById(userId, budgetId);

    return this.budgetAlertsRepository.findManyByBudgetIdAndUserId(
      budgetId,
      userId,
      {
        channel: query.channel,
        isEnabled: query.isEnabled,
      },
    );
  }

  async findById(userId: string, budgetAlertId: string) {
    const budgetAlert = await this.budgetAlertsRepository.findByIdAndUserId(
      budgetAlertId,
      userId,
    );

    if (!budgetAlert) {
      throw new NotFoundException('Budget alert not found');
    }

    return budgetAlert;
  }

  async update(
    userId: string,
    budgetAlertId: string,
    dto: UpdateBudgetAlertDto,
  ) {
    const existingBudgetAlert =
      await this.budgetAlertsRepository.findByIdAndUserId(
        budgetAlertId,
        userId,
      );

    if (!existingBudgetAlert) {
      throw new NotFoundException('Budget alert not found');
    }

    const data: Parameters<typeof this.budgetAlertsRepository.update>[2] = {};

    if (dto.thresholdPercentage !== undefined) {
      data.thresholdPercentage = dto.thresholdPercentage;
    }
    if (dto.channel !== undefined) {
      data.channel = dto.channel;
    }
    if (dto.isEnabled !== undefined) {
      data.isEnabled = dto.isEnabled;
    }

    if (Object.keys(data).length === 0) {
      return existingBudgetAlert;
    }

    await this.budgetAlertsRepository.update(budgetAlertId, userId, data);

    return this.findById(userId, budgetAlertId);
  }

  async setEnabled(userId: string, budgetAlertId: string, isEnabled: boolean) {
    const existingBudgetAlert =
      await this.budgetAlertsRepository.findByIdAndUserId(
        budgetAlertId,
        userId,
      );

    if (!existingBudgetAlert) {
      throw new NotFoundException('Budget alert not found');
    }
    if (existingBudgetAlert.isEnabled === isEnabled) {
      return existingBudgetAlert;
    }

    await this.budgetAlertsRepository.update(budgetAlertId, userId, {
      isEnabled,
    });

    return this.findById(userId, budgetAlertId);
  }

  async remove(userId: string, budgetAlertId: string) {
    const existingBudgetAlert =
      await this.budgetAlertsRepository.findByIdAndUserId(
        budgetAlertId,
        userId,
      );

    if (!existingBudgetAlert) {
      throw new NotFoundException('Budget alert not found');
    }

    await this.budgetAlertsRepository.delete(budgetAlertId, userId);

    return {
      message: 'Budget alert deleted successfully',
    };
  }
}
