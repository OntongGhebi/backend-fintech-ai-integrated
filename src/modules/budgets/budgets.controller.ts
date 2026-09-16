import { Controller, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { BudgetsService } from './budgets.service';

@Controller('budgets')
@ApiTags('Budgets')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}
}
