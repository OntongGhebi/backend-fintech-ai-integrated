import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { GetRecurringTransactionsQueryDto } from './dto/get-recurring-transaction-query.dto';

@Controller('recurring-transactions')
@ApiTags('Recurring Transactions')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class RecurringTransactionsController {
  constructor(
    private readonly recurringTransactionsService: RecurringTransactionsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a recurring transaction',
    description:
      'Creates a recurring transaction owned by the authenticated user.',
  })
  @ApiResponse({
    status: 201,
    description: 'Recurring transaction created successfully.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid dates, validation error, or unsupported recurring frequency.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required.',
  })
  @ApiResponse({
    status: 404,
    description: 'Account or category not found.',
  })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRecurringTransactionDto,
  ) {
    return this.recurringTransactionsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List recurring transactions',
    description:
      'Returns recurring transactions owned by the authenticated user with optional filters.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recurring transactions retrieved successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required.',
  })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: GetRecurringTransactionsQueryDto,
  ) {
    return this.recurringTransactionsService.findAll(userId, query);
  }
}
