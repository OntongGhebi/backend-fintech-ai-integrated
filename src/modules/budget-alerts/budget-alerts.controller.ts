import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { CreateBudgetAlertDto } from './dto/create-budget-alert.dto';
import { BudgetAlertsService } from './budget-alerts.service';
@Controller('budgets/:budgetId/alerts')
@ApiTags('Budget Alerts')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class BudgetAlertsController {
  constructor(private readonly budgetAlertsService: BudgetAlertsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a budget alert',
    description:
      'Creates a budget alert for a budget owned by the authenticated user.',
  })
  @ApiParam({
    name: 'budgetId',
    description: 'Budget UUID',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({
    status: 201,
    description: 'Budget alert created successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Budget not found.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed.',
  })
  async create(
    @CurrentUser('id') userId: string,
    @Param('budgetId', new ParseUUIDPipe({ version: '4' })) budgetId: string,
    @Body() dto: CreateBudgetAlertDto,
  ) {
    return this.budgetAlertsService.create(userId, budgetId, dto);
  }
}
