import {
  Body,
  Controller,
  Delete,
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
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';

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

  @Post('transfer')
  @ApiCreatedResponse({ type: TransferResponseDto })
  async createTransfer(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTransferDto,
  ): Promise<TransferResponseDto> {
    const result = await this.transactionsService.createTransfer(userId, dto);
    return {
      transferGroupId: result.transferGroupId,
      transactions: result.transactions.map((transaction) =>
        this.toResponse(transaction),
      ),
    };
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

  @Patch(':id') @ApiOkResponse({ type: TransactionResponseDto }) async update(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) transactionId: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.transactionsService.update(
      transactionId,
      userId,
      dto,
    );
    return this.toResponse(transaction);
  }

  @Delete(':id')
  @ApiOkResponse({
    schema: { example: { message: 'Transaction voided successfully' } },
  })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) transactionId: string,
  ): Promise<{ message: string }> {
    return this.transactionsService.voidTransaction(transactionId, userId);
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
