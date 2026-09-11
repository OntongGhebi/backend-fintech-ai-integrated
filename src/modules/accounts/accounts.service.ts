import { ConflictException, Injectable } from '@nestjs/common';
import { AccountsRepository } from './repositories/accounts.repository';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly accountsRepository: AccountsRepository) {}

  async create(userId: string, dto: CreateAccountDto) {
    const name = dto.name.trim();
    const currency = (dto.currency ?? 'IDR').toUpperCase();

    const existingAccounts =
      await this.accountsRepository.findManyByUserId(userId);

    const duplicatedName = existingAccounts.some(
      (account) => account.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (duplicatedName) {
      throw new ConflictException('An account with this name already exists');
    }

    return this.accountsRepository.create({
      userId,
      name,
      type: dto.type,
      openingBalance: dto.openingBalance ?? 0,
      currency,
      isActive: true,
    });
  }

  async findById(accountId: string) {
    return this.accountsRepository.findById(accountId);
  }

  async findByIdAndUserId(accountId: string, userId: string) {
    return this.accountsRepository.findByIdAndUserId(accountId, userId);
  }

  async findManyByUserId(userId: string) {
    return this.accountsRepository.findManyByUserId(userId);
  }
}
