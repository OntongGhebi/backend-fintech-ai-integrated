import { Injectable } from '@nestjs/common';
import { BudgetAlertsRepository } from './repositories/budget-alerts.repository';
import { BudgetsService } from '../budgets/budgets.service';
import { CreateBudgetAlertDto } from './dto/create-budget-alert.dto';
import { GetBudgetAlertsQueryDto } from './dto/get-budget-alerts-query.dto';

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
}
