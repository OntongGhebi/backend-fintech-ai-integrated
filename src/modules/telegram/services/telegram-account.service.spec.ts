import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { TelegramAccountRepository } from '../repositories/telegram-account.repository';
import { TelegramLinkTokenService } from './telegram-link-token.service';
import { TelegramAccountService } from './telegram-account.service';

describe('TelegramAccountService', () => {
  let service: TelegramAccountService;

  let repository: {
    findByTelegramUserId: jest.Mock;
    findByUserId: jest.Mock;
    create: jest.Mock;
    relink: jest.Mock;
    unlink: jest.Mock;
  };

  let linkTokenService: {
    create: jest.Mock;
    consume: jest.Mock;
  };

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const telegramUserId = BigInt(40777718);

  const createExistingAccount = (overrides: Record<string, unknown> = {}) => ({
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    userId,
    telegramUserId,
    telegramUsername: 'ghebi',
    firstName: 'Ghebi',
    lastName: 'Armando',
    isVerified: true,
    unlinkedAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    repository = {
      findByTelegramUserId: jest.fn(),
      findByUserId: jest.fn(),
      create: jest.fn(),
      relink: jest.fn(),
      unlink: jest.fn(),
    };

    linkTokenService = {
      create: jest.fn(),
      consume: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramAccountService,
        {
          provide: TelegramAccountRepository,
          useValue: repository,
        },
        {
          provide: TelegramLinkTokenService,
          useValue: linkTokenService,
        },
      ],
    }).compile();

    service = module.get<TelegramAccountService>(TelegramAccountService);
  });

  describe('createLinkCode', () => {
    it('creates a linking code for the authenticated user', async () => {
      linkTokenService.create.mockResolvedValue('12345678');

      await expect(service.createLinkCode(userId)).resolves.toEqual({
        code: '12345678',
        expiresInSeconds: 600,
      });

      expect(linkTokenService.create).toHaveBeenCalledWith(userId);
    });
  });

  describe('completeLink', () => {
    const input = {
      telegramUserId,
      telegramUsername: 'ghebi',
      firstName: 'Ghebi',
      lastName: 'Armando',
    };

    it('creates a new Telegram account using userId from the token', async () => {
      linkTokenService.consume.mockResolvedValue({ userId });
      repository.findByTelegramUserId.mockResolvedValue(null);

      const createdAccount = createExistingAccount();

      repository.create.mockResolvedValue(createdAccount);

      await expect(service.completeLink(input, '12345678')).resolves.toEqual(
        createdAccount,
      );

      expect(linkTokenService.consume).toHaveBeenCalledWith('12345678');

      expect(repository.create).toHaveBeenCalledWith({
        userId,
        telegramUserId,
        telegramUsername: 'ghebi',
        firstName: 'Ghebi',
        lastName: 'Armando',
      });
    });

    it('rejects an invalid or expired code', async () => {
      linkTokenService.consume.mockResolvedValue(null);

      await expect(
        service.completeLink(input, '12345678'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repository.findByTelegramUserId).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a Telegram account already linked to another user', async () => {
      linkTokenService.consume.mockResolvedValue({ userId });

      repository.findByTelegramUserId.mockResolvedValue(
        createExistingAccount({
          userId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        }),
      );

      await expect(
        service.completeLink(input, '12345678'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.relink).not.toHaveBeenCalled();
    });

    it('returns an already linked account belonging to the same user', async () => {
      const existingAccount = createExistingAccount();

      linkTokenService.consume.mockResolvedValue({ userId });

      repository.findByTelegramUserId.mockResolvedValue(existingAccount);

      await expect(service.completeLink(input, '12345678')).resolves.toEqual(
        existingAccount,
      );

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.relink).not.toHaveBeenCalled();
    });

    it('relinks an account previously unlinked by the same user', async () => {
      const unlinkedAccount = createExistingAccount({
        unlinkedAt: new Date(),
      });

      const relinkedAccount = createExistingAccount();

      linkTokenService.consume.mockResolvedValue({ userId });

      repository.findByTelegramUserId.mockResolvedValue(unlinkedAccount);

      repository.relink.mockResolvedValue(relinkedAccount);

      await expect(service.completeLink(input, '12345678')).resolves.toEqual(
        relinkedAccount,
      );

      expect(repository.relink).toHaveBeenCalledWith(unlinkedAccount.id, {
        userId,
        telegramUsername: 'ghebi',
        firstName: 'Ghebi',
        lastName: 'Armando',
      });
    });
  });
});
