import { ConflictException, NotFoundException } from '@nestjs/common';

import { TelegramAccountRepository } from '../repositories/telegram-account.repository';
import { TelegramLinkTokenService } from './telegram-link-token.service';
import { TelegramAccountService } from './telegram-account.service';

describe('TelegramAccountService linking', () => {
  let service: TelegramAccountService;

  let accountRepository: {
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

  const tokenUserId = 'user-from-one-time-token';

  const telegramUserId = BigInt(123456789);

  const linkedAccount = {
    id: 'telegram-account-id',
    userId: tokenUserId,
    telegramUserId,
    telegramUsername: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isVerified: true,
    unlinkedAt: null,
  };

  beforeEach(() => {
    accountRepository = {
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

    service = new TelegramAccountService(
      accountRepository as unknown as TelegramAccountRepository,
      linkTokenService as unknown as TelegramLinkTokenService,
    );
  });

  it('creates a link code for the authenticated application user', async () => {
    linkTokenService.create.mockResolvedValue('12345678');

    await expect(service.createLinkCode(tokenUserId)).resolves.toEqual({
      code: '12345678',
      expiresInSeconds: 600,
    });

    expect(linkTokenService.create).toHaveBeenCalledWith(tokenUserId);
  });

  it('creates a Telegram account using userId from the consumed token', async () => {
    linkTokenService.consume.mockResolvedValue({
      userId: tokenUserId,
    });

    accountRepository.findByTelegramUserId.mockResolvedValue(null);
    accountRepository.create.mockResolvedValue(linkedAccount);

    await expect(
      service.completeLink(
        {
          telegramUserId,
          telegramUsername: 'testuser',
          firstName: 'Test',
          lastName: 'User',
        },
        '12345678',
      ),
    ).resolves.toEqual(linkedAccount);

    expect(linkTokenService.consume).toHaveBeenCalledWith('12345678');

    expect(accountRepository.create).toHaveBeenCalledWith({
      userId: tokenUserId,
      telegramUserId,
      telegramUsername: 'testuser',
      firstName: 'Test',
      lastName: 'User',
    });
  });

  it('rejects an invalid or expired linking code', async () => {
    linkTokenService.consume.mockResolvedValue(null);

    await expect(
      service.completeLink({ telegramUserId }, '00000000'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(accountRepository.findByTelegramUserId).not.toHaveBeenCalled();
    expect(accountRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a Telegram account already linked to another application user', async () => {
    linkTokenService.consume.mockResolvedValue({
      userId: 'new-owner',
    });

    accountRepository.findByTelegramUserId.mockResolvedValue({
      ...linkedAccount,
      userId: 'existing-owner',
    });

    await expect(
      service.completeLink({ telegramUserId }, '12345678'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(accountRepository.create).not.toHaveBeenCalled();
    expect(accountRepository.relink).not.toHaveBeenCalled();
  });

  it('returns the existing account when it is already linked to the same user', async () => {
    linkTokenService.consume.mockResolvedValue({
      userId: tokenUserId,
    });

    accountRepository.findByTelegramUserId.mockResolvedValue(linkedAccount);

    await expect(
      service.completeLink({ telegramUserId }, '12345678'),
    ).resolves.toEqual(linkedAccount);

    expect(accountRepository.create).not.toHaveBeenCalled();
    expect(accountRepository.relink).not.toHaveBeenCalled();
  });

  it('relinks a previously unlinked Telegram account to the token owner', async () => {
    linkTokenService.consume.mockResolvedValue({
      userId: tokenUserId,
    });

    accountRepository.findByTelegramUserId.mockResolvedValue({
      ...linkedAccount,
      isVerified: true,
      unlinkedAt: new Date(),
    });

    accountRepository.relink.mockResolvedValue(linkedAccount);

    await expect(
      service.completeLink(
        {
          telegramUserId,
          telegramUsername: 'newusername',
          firstName: 'New',
          lastName: 'Name',
        },
        '12345678',
      ),
    ).resolves.toEqual(linkedAccount);

    expect(accountRepository.relink).toHaveBeenCalledWith(linkedAccount.id, {
      userId: tokenUserId,
      telegramUsername: 'newusername',
      firstName: 'New',
      lastName: 'Name',
    });
  });
});
