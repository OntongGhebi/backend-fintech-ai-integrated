import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';

import { AccountsService } from './accounts.service';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AccountResponseDto } from './dto/account-response.dto';
import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountType as DomainAccountType } from 'src/database/enums/account-type.enum';

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
}
