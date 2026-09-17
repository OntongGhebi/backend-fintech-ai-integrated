import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { BudgetsService } from './budgets.service';
import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { GetBudgetsQueryDto } from './dto/get-budgets-query.dto';

@Controller('budgets')
@ApiTags('Budgets')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new budget' })
  @ApiResponse({ status: 201, description: 'Budget created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid budget data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 409,
    description: 'A budget with the same name already exists',
  })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBudgetDto,
  ) {
    return this.budgetsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all budgets for the current user' })
  @ApiResponse({ status: 200, description: 'Budgets retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: GetBudgetsQueryDto,
  ) {
    return this.budgetsService.findAll(userId, query);
  }
}
