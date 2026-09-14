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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { CreateTransactionDto } from './dto/create-transaction.dto';
import { GetTransactionsQueryDto } from './dto/get-transaction-query.dto';
import { TransactionListResponseDto } from './dto/transaction-list-response.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@ApiTags('Transactions')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiCreatedResponse({
    type: TransactionResponseDto,
  })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.transactionsService.create(userId, dto);

    return this.toResponse(transaction);
  }

  @Get()
  @ApiOkResponse({
    type: TransactionListResponseDto,
  })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: GetTransactionsQueryDto,
  ): Promise<TransactionListResponseDto> {
    const result = await this.transactionsService.findManyByUserId(
      userId,
      query,
    );

    return {
      data: result.data.map((transaction) => this.toResponse(transaction)),
      meta: result.meta,
    };
  }

  @Get(':id') @ApiOkResponse({ type: TransactionResponseDto }) async findOne(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) transactionId: string,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.transactionsService.findById(
      transactionId,
      userId,
    );
    return this.toResponse(transaction);
  }

  private toResponse(transaction: {
    id: string;
    userId: string;
    accountId: string;
    categoryId: string | null;
    type: string;
    amount: {
      toString(): string;
    };
    currency: string;
    description: string | null;
    transactionDate: Date;
    source: string;
    status: string;
    transferGroupId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): TransactionResponseDto {
    return {
      id: transaction.id,
      userId: transaction.userId,
      accountId: transaction.accountId,
      categoryId: transaction.categoryId,
      type: transaction.type as TransactionResponseDto['type'],
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      description: transaction.description,
      transactionDate: transaction.transactionDate,
      source: transaction.source as TransactionResponseDto['source'],
      status: transaction.status as TransactionResponseDto['status'],
      transferGroupId: transaction.transferGroupId,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
