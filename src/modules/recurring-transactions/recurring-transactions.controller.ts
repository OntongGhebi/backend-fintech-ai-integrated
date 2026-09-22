import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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

import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { GetRecurringTransactionsQueryDto } from './dto/get-recurring-transaction-query.dto';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto';
import { SetRecurringTransactionEnabledDto } from './dto/set-recurring-transaction-enabled.dto';

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

  @Get(':id')
  @ApiOperation({
    summary: 'Get recurring transaction detail',
    description:
      'Returns a single recurring transaction owned by the authenticated user.',
  })
  @ApiParam({
    name: 'id',
    description: 'Recurring transaction UUID.',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({
    status: 200,
    description: 'Recurring transaction retrieved successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required.',
  })
  @ApiResponse({
    status: 404,
    description: 'Recurring transaction not found.',
  })
  async findById(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    recurringTransactionId: string,
  ) {
    return this.recurringTransactionsService.findById(
      userId,
      recurringTransactionId,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a recurring transaction',
    description:
      'Updates a recurring transaction owned by the authenticated user.',
  })
  @ApiParam({
    name: 'id',
    description: 'Recurring transaction UUID.',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({
    status: 200,
    description: 'Recurring transaction updated successfully.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid validation data or inconsistent recurring transaction dates.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required.',
  })
  @ApiResponse({
    status: 404,
    description: 'Recurring transaction, account, or category not found.',
  })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    recurringTransactionId: string,
    @Body() dto: UpdateRecurringTransactionDto,
  ) {
    return this.recurringTransactionsService.update(
      userId,
      recurringTransactionId,
      dto,
    );
  }

  @Patch(':id/enabled')
  @ApiOperation({
    summary: 'Enable or disable a recurring transaction',
    description:
      'Changes the active state of a recurring transaction owned by the authenticated user.',
  })
  @ApiParam({
    name: 'id',
    description: 'Recurring transaction UUID.',
    example: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
  })
  @ApiResponse({
    status: 200,
    description: 'Recurring transaction active state updated successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid active state.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required.',
  })
  @ApiResponse({
    status: 404,
    description: 'Recurring transaction not found.',
  })
  async setEnabled(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    recurringTransactionId: string,
    @Body() dto: SetRecurringTransactionEnabledDto,
  ) {
    return this.recurringTransactionsService.setEnabled(
      userId,
      recurringTransactionId,
      dto,
    );
  }
}
