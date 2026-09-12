import { ConflictException, NotFoundException } from '@nestjs/common';

import { AccountType } from 'src/database/enums/account-type.enum';

import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountsService } from './accounts.service';
import { AccountsRepository } from './repositories/accounts.repository';

describe('AccountsService', () => {
  let service: AccountsService;
  let repository: jest.Mocked<AccountsRepository>;

  const userId = 'user-uuid-1';
  const otherUserId = 'user-uuid-2';
  const accountId = 'account-uuid-1';

  const baseAccount = {
    id: accountId,
    userId,
    name: 'BCA Main Account',
    type: AccountType.BANK,
    openingBalance: 1500000,
    currency: 'IDR',
    isActive: true,
    createdAt: new Date('2026-09-11T10:00:00.000Z'),
    updatedAt: new Date('2026-09-11T10:00:00.000Z'),
    deletedAt: null,
  };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUserId: jest.fn(),
      findManyByUserId: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<AccountsRepository>;

    service = new AccountsService(repository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an account successfully', async () => {
      const dto: CreateAccountDto = {
        name: '  BCA Main Account  ',
        type: AccountType.BANK,
        openingBalance: 1500000,
        currency: 'idr',
      };

      repository.findManyByUserId.mockResolvedValue([]);
      repository.create.mockResolvedValue({
        ...baseAccount,
        name: 'BCA Main Account',
        currency: 'IDR',
      });

      const result = await service.create(userId, dto);

      expect(repository.findManyByUserId).toHaveBeenCalledWith(userId);

      expect(repository.create).toHaveBeenCalledWith({
        userId,
        name: 'BCA Main Account',
        type: AccountType.BANK,
        openingBalance: 1500000,
        currency: 'IDR',
        isActive: true,
      });

      expect(result).toEqual({
        ...baseAccount,
        name: 'BCA Main Account',
        currency: 'IDR',
      });
    });

    it('should use IDR when currency is not provided', async () => {
      const dto: CreateAccountDto = {
        name: 'Cash Wallet',
        type: AccountType.CASH,
      };

      repository.findManyByUserId.mockResolvedValue([]);
      repository.create.mockResolvedValue({
        ...baseAccount,
        name: 'Cash Wallet',
        type: AccountType.CASH,
        openingBalance: 0,
        currency: 'IDR',
      });

      await service.create(userId, dto);

      expect(repository.create).toHaveBeenCalledWith({
        userId,
        name: 'Cash Wallet',
        type: AccountType.CASH,
        openingBalance: 0,
        currency: 'IDR',
        isActive: true,
      });
    });

    it('should use zero as the default opening balance', async () => {
      const dto: CreateAccountDto = {
        name: 'New Bank Account',
        type: AccountType.BANK,
        currency: 'IDR',
      };

      repository.findManyByUserId.mockResolvedValue([]);
      repository.create.mockResolvedValue({
        ...baseAccount,
        name: 'New Bank Account',
        openingBalance: 0,
      });

      await service.create(userId, dto);

      expect(repository.create).toHaveBeenCalledWith({
        userId,
        name: 'New Bank Account',
        type: AccountType.BANK,
        openingBalance: 0,
        currency: 'IDR',
        isActive: true,
      });
    });

    it('should reject duplicate account names case-insensitively', async () => {
      const dto: CreateAccountDto = {
        name: '  bca main account ',
        type: AccountType.BANK,
        currency: 'IDR',
      };

      repository.findManyByUserId.mockResolvedValue([baseAccount]);

      await expect(service.create(userId, dto)).rejects.toThrow(
        new ConflictException('An account with this name already exists'),
      );

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should allow the same account name for a different user', async () => {
      const dto: CreateAccountDto = {
        name: 'BCA Main Account',
        type: AccountType.BANK,
        currency: 'IDR',
      };

      repository.findManyByUserId.mockResolvedValue([]);
      repository.create.mockResolvedValue({
        ...baseAccount,
        userId: otherUserId,
      });

      const result = await service.create(otherUserId, dto);

      expect(repository.findManyByUserId).toHaveBeenCalledWith(otherUserId);

      expect(repository.create).toHaveBeenCalledWith({
        userId: otherUserId,
        name: 'BCA Main Account',
        type: AccountType.BANK,
        openingBalance: 0,
        currency: 'IDR',
        isActive: true,
      });

      expect(result.userId).toBe(otherUserId);
    });
  });

  describe('findById', () => {
    it('should return an account owned by the user', async () => {
      repository.findByIdAndUserId.mockResolvedValue(baseAccount);

      const result = await service.findById(accountId, userId);

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        accountId,
        userId,
      );

      expect(result).toEqual(baseAccount);
    });

    it('should throw NotFoundException when account does not exist', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(accountId, userId)).rejects.toThrow(
        new NotFoundException('Account not found'),
      );
    });

    it('should not allow access to another user account', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(accountId, otherUserId)).rejects.toThrow(
        new NotFoundException('Account not found'),
      );

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        accountId,
        otherUserId,
      );
    });
  });

  describe('findManyByUserId', () => {
    it('should return all active accounts owned by the user', async () => {
      const accounts = [
        baseAccount,
        {
          ...baseAccount,
          id: 'account-uuid-2',
          name: 'Cash Wallet',
          type: AccountType.CASH,
        },
      ];

      repository.findManyByUserId.mockResolvedValue(accounts);

      const result = await service.findManyByUserId(userId);

      expect(repository.findManyByUserId).toHaveBeenCalledWith(userId);

      expect(result).toEqual(accounts);
    });

    it('should return an empty array when the user has no accounts', async () => {
      repository.findManyByUserId.mockResolvedValue([]);

      const result = await service.findManyByUserId(userId);

      expect(result).toEqual([]);

      expect(repository.findManyByUserId).toHaveBeenCalledWith(userId);
    });
  });

  describe('update', () => {
    it('should update the account name successfully', async () => {
      const dto: UpdateAccountDto = {
        name: '  BCA Personal Account  ',
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAccount)
        .mockResolvedValueOnce({
          ...baseAccount,
          name: 'BCA Personal Account',
        });

      repository.findManyByUserId.mockResolvedValue([baseAccount]);

      repository.update.mockResolvedValue({
        count: 1,
      });

      const result = await service.update(accountId, userId, dto);

      expect(repository.findByIdAndUserId).toHaveBeenNthCalledWith(
        1,
        accountId,
        userId,
      );

      expect(repository.findManyByUserId).toHaveBeenCalledWith(userId);

      expect(repository.update).toHaveBeenCalledWith(accountId, userId, {
        name: 'BCA Personal Account',
      });

      expect(repository.findByIdAndUserId).toHaveBeenNthCalledWith(
        2,
        accountId,
        userId,
      );

      expect(result?.name).toBe('BCA Personal Account');
    });

    it('should update account type successfully', async () => {
      const dto: UpdateAccountDto = {
        type: AccountType.E_WALLET,
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAccount)
        .mockResolvedValueOnce({
          ...baseAccount,
          type: AccountType.E_WALLET,
        });

      repository.update.mockResolvedValue({
        count: 1,
      });

      const result = await service.update(accountId, userId, dto);

      expect(repository.update).toHaveBeenCalledWith(accountId, userId, {
        type: AccountType.E_WALLET,
      });

      expect(result?.type).toBe(AccountType.E_WALLET);
    });

    it('should update currency and normalize it to uppercase', async () => {
      const dto: UpdateAccountDto = {
        currency: 'usd',
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAccount)
        .mockResolvedValueOnce({
          ...baseAccount,
          currency: 'USD',
        });

      repository.update.mockResolvedValue({
        count: 1,
      });

      const result = await service.update(accountId, userId, dto);

      expect(repository.update).toHaveBeenCalledWith(accountId, userId, {
        currency: 'USD',
      });

      expect(result?.currency).toBe('USD');
    });

    it('should update multiple fields successfully', async () => {
      const dto: UpdateAccountDto = {
        name: 'BCA Savings',
        type: AccountType.BANK,
        currency: 'usd',
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAccount)
        .mockResolvedValueOnce({
          ...baseAccount,
          name: 'BCA Savings',
          currency: 'USD',
        });

      repository.findManyByUserId.mockResolvedValue([baseAccount]);

      repository.update.mockResolvedValue({
        count: 1,
      });

      const result = await service.update(accountId, userId, dto);

      expect(repository.update).toHaveBeenCalledWith(accountId, userId, {
        name: 'BCA Savings',
        type: AccountType.BANK,
        currency: 'USD',
      });

      expect(result?.name).toBe('BCA Savings');
      expect(result?.currency).toBe('USD');
    });

    it('should reject duplicate account names during update', async () => {
      const dto: UpdateAccountDto = {
        name: 'Cash Wallet',
      };

      const anotherAccount = {
        ...baseAccount,
        id: 'account-uuid-2',
        name: 'Cash Wallet',
      };

      repository.findByIdAndUserId.mockResolvedValue(baseAccount);

      repository.findManyByUserId.mockResolvedValue([
        baseAccount,
        anotherAccount,
      ]);

      await expect(service.update(accountId, userId, dto)).rejects.toThrow(
        new ConflictException('An account with this name already exists'),
      );

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should allow keeping the same account name', async () => {
      const dto: UpdateAccountDto = {
        name: '  BCA Main Account  ',
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAccount)
        .mockResolvedValueOnce({
          ...baseAccount,
          name: 'BCA Main Account',
        });

      repository.findManyByUserId.mockResolvedValue([baseAccount]);

      repository.update.mockResolvedValue({
        count: 1,
      });

      await service.update(accountId, userId, dto);

      expect(repository.update).toHaveBeenCalledWith(accountId, userId, {
        name: 'BCA Main Account',
      });
    });

    it('should throw NotFoundException when updating a nonexistent account', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.update(accountId, userId, {
          name: 'New Name',
        }),
      ).rejects.toThrow(new NotFoundException('Account not found'));

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when update affects no rows', async () => {
      repository.findByIdAndUserId.mockResolvedValue(baseAccount);

      repository.update.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.update(accountId, userId, {
          type: AccountType.CASH,
        }),
      ).rejects.toThrow(new NotFoundException('Account not found'));
    });

    it('should not allow updating another user account', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.update(accountId, otherUserId, {
          name: 'Hacked Account',
        }),
      ).rejects.toThrow(new NotFoundException('Account not found'));

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('should archive the account successfully', async () => {
      repository.findByIdAndUserId.mockResolvedValue(baseAccount);

      repository.softDelete.mockResolvedValue({
        count: 1,
      });

      const result = await service.archive(accountId, userId);

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        accountId,
        userId,
      );

      expect(repository.softDelete).toHaveBeenCalledWith(accountId, userId);

      expect(result).toEqual({
        message: 'Account archived successfully',
      });
    });

    it('should throw NotFoundException when archiving a nonexistent account', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.archive(accountId, userId)).rejects.toThrow(
        new NotFoundException('Account not found'),
      );

      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when archive affects no rows', async () => {
      repository.findByIdAndUserId.mockResolvedValue(baseAccount);

      repository.softDelete.mockResolvedValue({
        count: 0,
      });

      await expect(service.archive(accountId, userId)).rejects.toThrow(
        new NotFoundException('Account not found'),
      );
    });

    it('should not allow archiving another user account', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.archive(accountId, otherUserId)).rejects.toThrow(
        new NotFoundException('Account not found'),
      );

      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  });
});
