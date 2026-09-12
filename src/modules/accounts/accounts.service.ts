import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountsRepository } from './repositories/accounts.repository';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

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

  async findById(accountId: string, userId: string) {
    const account = await this.accountsRepository.findByIdAndUserId(
      accountId,
      userId,
    );

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return account;
  }

  async findByIdAndUserId(accountId: string, userId: string) {
    return this.accountsRepository.findByIdAndUserId(accountId, userId);
  }

  async findManyByUserId(userId: string) {
    return this.accountsRepository.findManyByUserId(userId);
  }

  async update(accountId: string, userId: string, dto: UpdateAccountDto) {
    const account = await this.accountsRepository.findByIdAndUserId(
      accountId,
      userId,
    );

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const data: UpdateAccountDto = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      const accounts = await this.accountsRepository.findManyByUserId(userId);

      const duplicatedName = accounts.some(
        (item) =>
          item.id !== accountId &&
          item.name.trim().toLowerCase() === name.toLowerCase(),
      );

      if (duplicatedName) {
        throw new ConflictException('An account with this name already exists');
      }

      data.name = name;
    }

    if (dto.type !== undefined) {
      data.type = dto.type;
    }

    if (dto.currency !== undefined) {
      data.currency = dto.currency.toUpperCase();
    }

    const updated = await this.accountsRepository.update(
      accountId,
      userId,
      data,
    );

    if (updated.count === 0) {
      throw new NotFoundException('Account not found');
    }

    return this.accountsRepository.findByIdAndUserId(accountId, userId);
  }

  async archive(accountId: string, userId: string) {
    const account = await this.accountsRepository.findByIdAndUserId(
      accountId,
      userId,
    );

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const archived = await this.accountsRepository.softDelete(
      accountId,
      userId,
    );

    if (archived.count === 0) {
      throw new NotFoundException('Account not found');
    }

    return {
      message: 'Account archived successfully',
    };
  }
}
