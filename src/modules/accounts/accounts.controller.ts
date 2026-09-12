import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AccountsService } from './accounts.service';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AccountResponseDto } from './dto/account-response.dto';
import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountType as DomainAccountType } from 'src/database/enums/account-type.enum';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
@ApiTags('Accounts')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiCreatedResponse({
    type: AccountResponseDto,
  })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAccountDto,
  ): Promise<AccountResponseDto> {
    const account = await this.accountsService.create(userId, dto);

    return {
      id: account.id,
      userId: account.userId,
      name: account.name,
      type: String(
        Object.entries(DomainAccountType).find(
          ([, value]) => String(value) === String(account.type),
        )?.[0] ?? String(account.type),
      ) as AccountResponseDto['type'],
      openingBalance: account.openingBalance.toString(),
      currency: account.currency,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  @Get()
  @ApiOkResponse({
    type: AccountResponseDto,
    isArray: true,
  })
  async findAll(
    @CurrentUser('id') userId: string,
  ): Promise<AccountResponseDto[]> {
    const accounts = await this.accountsService.findManyByUserId(userId);

    return accounts.map((account) => this.toResponse(account));
  }

  @Get(':id')
  @ApiOkResponse({
    type: AccountResponseDto,
  })
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id') accountId: string,
  ): Promise<AccountResponseDto> {
    const account = await this.accountsService.findById(accountId, userId);

    return this.toResponse(account);
  }

  @Patch(':id')
  @ApiOkResponse({
    type: AccountResponseDto,
  })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') accountId: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountResponseDto> {
    const account = await this.accountsService.update(accountId, userId, dto);

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return this.toResponse(account);
  }

  private toResponse(account: {
    id: string;
    userId: string;
    name: string;
    type: string;
    openingBalance: {
      toString(): string;
    };
    currency: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): AccountResponseDto {
    return {
      id: account.id,
      userId: account.userId,
      name: account.name,
      type: String(
        Object.entries(DomainAccountType).find(
          ([, value]) => String(value) === String(account.type),
        )?.[0] ?? String(account.type),
      ) as AccountResponseDto['type'],
      openingBalance: account.openingBalance.toString(),
      currency: account.currency,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
