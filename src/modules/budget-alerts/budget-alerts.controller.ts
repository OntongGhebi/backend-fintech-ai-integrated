import { Controller, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { BudgetAlertsService } from './budget-alerts.service';

@Controller('budget-alerts')
@ApiTags('Budget Alerts')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class BudgetAlertsController {
  constructor(private readonly budgetAlertsService: BudgetAlertsService) {}
}
