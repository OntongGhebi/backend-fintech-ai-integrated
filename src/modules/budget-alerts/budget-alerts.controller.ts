import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { GetBudgetAlertsQueryDto } from './dto/get-budget-alerts-query.dto';
import { BudgetAlertsService } from './budget-alerts.service';

@Controller()
@ApiTags('Budget Alerts')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class BudgetAlertsController {
  constructor(private readonly budgetAlertsService: BudgetAlertsService) {}

  @Post('budgets/:budgetId/alerts')
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
  async create(
    @CurrentUser('id') userId: string,
    @Param('budgetId', new ParseUUIDPipe({ version: '4' })) budgetId: string,
    @Body() dto: CreateBudgetAlertDto,
  ) {
    return this.budgetAlertsService.create(userId, budgetId, dto);
  }

  @Get('budget-alerts')
  @ApiOperation({
    summary: 'Get all budget alerts',
    description:
      'Returns all budget alerts belonging to the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Budget alerts retrieved successfully.',
  })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: GetBudgetAlertsQueryDto,
  ) {
    return this.budgetAlertsService.findAll(userId, query);
  }

  @Get('budgets/:budgetId/alerts')
  @ApiOperation({
    summary: 'Get alerts for a budget',
    description:
      'Returns all alerts belonging to a specific budget owned by the authenticated user.',
  })
  @ApiParam({
    name: 'budgetId',
    description: 'Budget UUID',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({
    status: 200,
    description: 'Budget alerts retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Budget not found.',
  })
  async findAllByBudget(
    @CurrentUser('id') userId: string,
    @Param('budgetId', new ParseUUIDPipe({ version: '4' })) budgetId: string,
    @Query() query: GetBudgetAlertsQueryDto,
  ) {
    return this.budgetAlertsService.findAllByBudget(userId, budgetId, query);
  }

  @Get('budget-alerts/:alertId')
  @ApiOperation({
    summary: 'Get a budget alert by ID',
    description:
      'Returns a specific budget alert owned by the authenticated user.',
  })
  @ApiParam({
    name: 'alertId',
    description: 'Budget alert UUID',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({
    status: 200,
    description: 'Budget alert retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Budget alert not found.',
  })
  async findById(
    @CurrentUser('id') userId: string,
    @Param('alertId', new ParseUUIDPipe({ version: '4' })) alertId: string,
  ) {
    return this.budgetAlertsService.findById(userId, alertId);
  }
}
