import { Body, Controller, Post, UseGuards } from '@nestjs/common';

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
}
