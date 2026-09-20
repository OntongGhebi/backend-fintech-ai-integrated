import { Injectable } from '@nestjs/common';
import { BudgetAlertsRepository } from './repositories/budget-alerts.repository';
import { BudgetsService } from '../budgets/budgets.service';
import { CreateBudgetAlertDto } from './dto/create-budget-alert.dto';

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
}
