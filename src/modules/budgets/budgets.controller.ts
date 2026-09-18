import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Patch,
  Delete,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { BudgetsService } from './budgets.service';
import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { GetBudgetsQueryDto } from './dto/get-budgets-query.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { UpdateBudgetStatusDto } from './dto/update-budget-status.dto';

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

  @Get(':id')
  @ApiOperation({ summary: 'Get budget detail' })
  @ApiParam({
    name: 'id',
    description: 'Budget UUID',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({
    status: 200,
    description: 'Budget detail retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  async findById(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) budgetId: string,
  ) {
    return this.budgetsService.findById(userId, budgetId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update budget status' })
  @ApiParam({
    name: 'id',
    description: 'Budget UUID',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({
    status: 200,
    description: 'Budget status updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid budget status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  async updateStatus(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) budgetId: string,
    @Body() dto: UpdateBudgetStatusDto,
  ) {
    return this.budgetsService.updateStatus(userId, budgetId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update budget' })
  @ApiParam({
    name: 'id',
    description: 'Budget UUID',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({ status: 200, description: 'Budget updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid budget data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  @ApiResponse({
    status: 409,
    description: 'A budget with the same name already exists',
  })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) budgetId: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgetsService.update(userId, budgetId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive budget' })
  @ApiParam({
    name: 'id',
    description: 'Budget UUID',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({ status: 200, description: 'Budget archived successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) budgetId: string,
  ) {
    return this.budgetsService.remove(userId, budgetId);
  }
}
