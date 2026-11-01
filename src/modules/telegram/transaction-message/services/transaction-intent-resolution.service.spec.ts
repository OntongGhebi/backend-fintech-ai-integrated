import { TransactionIntentResolutionService } from './transaction-intent-resolution.service';

describe('TransactionIntentResolutionService', () => {
  let service: TransactionIntentResolutionService;

  let accountsRepository: {
    findByNameAndUserId: jest.Mock;
    findManyByUserId: jest.Mock;
  };

  let categoriesRepository: {
    findByNameAndUserId: jest.Mock;
  };

  beforeEach(() => {
    accountsRepository = {
      findByNameAndUserId: jest.fn(),
      findManyByUserId: jest.fn().mockResolvedValue([]),
    };

    categoriesRepository = {
      findByNameAndUserId: jest.fn(),
    };

    service = new TransactionIntentResolutionService(
      accountsRepository as any,
      categoriesRepository as any,
    );
  });

  const baseIntent = {
    intent: 'CREATE_TRANSACTION' as const,
    transactionType: 'EXPENSE' as const,
    amount: 25000,
    description: 'makan siang',
    accountHint: 'BCA',
    source: 'DETERMINISTIC' as const,
    confidence: 1,
  };

  it('should resolve an expense transaction account', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue({
      id: 'account-id',
      name: 'BCA',
      currency: 'IDR',
      isActive: true,
    });

    const result = await service.resolve('user-id', baseIntent);

    expect(result.status).toBe('RESOLVED');

    expect(result.intent).toMatchObject({
      intent: 'CREATE_TRANSACTION',
      transactionType: 'EXPENSE',
      amount: 25000,
      description: 'makan siang',
      accountId: 'account-id',
    });

    expect(result.intent?.categoryId).toBeUndefined();

    expect(accountsRepository.findByNameAndUserId).toHaveBeenCalledWith(
      'BCA',
      'user-id',
    );
  });

  it('should resolve account and category', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue({
      id: 'account-id',
      name: 'BCA',
      currency: 'IDR',
      isActive: true,
    });

    categoriesRepository.findByNameAndUserId.mockResolvedValue({
      id: 'category-id',
      name: 'Makanan',
      type: 'EXPENSE',
      isActive: true,
    });

    const result = await service.resolve('user-id', {
      ...baseIntent,
      categoryHint: 'Makanan',
    });

    expect(result.status).toBe('RESOLVED');

    expect(result.intent?.accountId).toBe('account-id');

    expect(result.intent?.categoryId).toBe('category-id');
  });

  it('should require an account', async () => {
    const result = await service.resolve('user-id', {
      ...baseIntent,
      accountHint: undefined,
    });

    expect(result).toEqual({
      status: 'NEEDS_ACCOUNT',
      message: 'A financial account is required for this transaction',
    });

    expect(accountsRepository.findByNameAndUserId).not.toHaveBeenCalled();
  });

  it('should return not found when account does not exist', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue(null);

    const result = await service.resolve('user-id', baseIntent);

    expect(result).toEqual({
      status: 'NOT_FOUND',
      message: 'Account "BCA" was not found',
    });
  });

  it('should reject an inactive account', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue({
      id: 'account-id',
      name: 'BCA',
      currency: 'IDR',
      isActive: false,
    });

    const result = await service.resolve('user-id', baseIntent);

    expect(result).toEqual({
      status: 'INVALID',
      message: 'The selected account is inactive',
    });
  });

  it('should reject a non-IDR account', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue({
      id: 'account-id',
      name: 'USD Account',
      currency: 'USD',
      isActive: true,
    });

    const result = await service.resolve('user-id', {
      ...baseIntent,
      accountHint: 'USD Account',
    });

    expect(result).toEqual({
      status: 'INVALID',
      message: 'The selected account currency must be IDR',
    });
  });

  it('should reject an unknown category', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue({
      id: 'account-id',
      name: 'BCA',
      currency: 'IDR',
      isActive: true,
    });

    categoriesRepository.findByNameAndUserId.mockResolvedValue(null);

    const result = await service.resolve('user-id', {
      ...baseIntent,
      categoryHint: 'Makanan',
    });

    expect(result).toEqual({
      status: 'NOT_FOUND',
      message: 'Category "Makanan" was not found',
    });
  });

  it('should reject an inactive category', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue({
      id: 'account-id',
      name: 'BCA',
      currency: 'IDR',
      isActive: true,
    });

    categoriesRepository.findByNameAndUserId.mockResolvedValue({
      id: 'category-id',
      name: 'Makanan',
      type: 'EXPENSE',
      isActive: false,
    });

    const result = await service.resolve('user-id', {
      ...baseIntent,
      categoryHint: 'Makanan',
    });

    expect(result).toEqual({
      status: 'INVALID',
      message: 'The selected category is inactive',
    });
  });

  it('should reject a category with the wrong transaction type', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue({
      id: 'account-id',
      name: 'BCA',
      currency: 'IDR',
      isActive: true,
    });

    categoriesRepository.findByNameAndUserId.mockResolvedValue({
      id: 'category-id',
      name: 'Gaji',
      type: 'INCOME',
      isActive: true,
    });

    const result = await service.resolve('user-id', {
      ...baseIntent,
      categoryHint: 'Gaji',
    });

    expect(result).toEqual({
      status: 'INVALID',
      message: 'The selected category is not a expense category',
    });
  });

  it('should reject a non-create intent', async () => {
    const result = await service.resolve('user-id', {
      ...baseIntent,
      intent: 'UNKNOWN',
    });

    expect(result.status).toBe('INVALID');

    expect(accountsRepository.findByNameAndUserId).not.toHaveBeenCalled();
  });

  it('should preserve the original intent', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue({
      id: 'account-id',
      name: 'BCA',
      currency: 'IDR',
      isActive: true,
    });

    const result = await service.resolve('user-id', baseIntent);

    expect(result.intent?.originalIntent).toEqual(baseIntent);
  });

  describe('account name matching', () => {
    it.each([
      ['bri', 'BRI Account', 'bri-account-id'],
      ['bca', 'BCA Main Account', 'bca-account-id'],
      ['mandiri', 'Mandiri Account', 'mandiri-account-id'],
    ])(
      'should resolve account hint "%s" to "%s"',
      async (accountHint, accountName, accountId) => {
        accountsRepository.findByNameAndUserId.mockResolvedValue(null);

        accountsRepository.findManyByUserId.mockResolvedValue([
          {
            id: accountId,
            name: accountName,
            currency: 'IDR',
            isActive: true,
          },
        ]);

        const result = await service.resolve('user-id', {
          ...baseIntent,
          accountHint,
        });

        expect(result.status).toBe('RESOLVED');
        expect(result.intent?.accountId).toBe(accountId);

        expect(accountsRepository.findManyByUserId).toHaveBeenCalledWith(
          'user-id',
        );
      },
    );

    it('should request clarification when multiple accounts match', async () => {
      accountsRepository.findByNameAndUserId.mockResolvedValue(null);

      accountsRepository.findManyByUserId.mockResolvedValue([
        {
          id: 'bri-account-1',
          name: 'BRI Account',
          currency: 'IDR',
          isActive: true,
        },
        {
          id: 'bri-account-2',
          name: 'BRI Savings',
          currency: 'IDR',
          isActive: true,
        },
      ]);

      const result = await service.resolve('user-id', {
        ...baseIntent,
        accountHint: 'bri',
      });

      expect(result.status).toBe('NEEDS_ACCOUNT');
      expect(result.message).toContain('full account name');
    });

    it('should not match an account belonging to another user', async () => {
      accountsRepository.findByNameAndUserId.mockResolvedValue(null);

      // The repository is expected to return only the current
      // user's accounts.
      accountsRepository.findManyByUserId.mockResolvedValue([]);

      const result = await service.resolve('user-id', {
        ...baseIntent,
        accountHint: 'bri',
      });

      expect(result.status).toBe('NOT_FOUND');
      expect(result.message).toContain('bri');
    });

    it('should still reject an inactive account after alias matching', async () => {
      accountsRepository.findByNameAndUserId.mockResolvedValue(null);

      accountsRepository.findManyByUserId.mockResolvedValue([
        {
          id: 'bri-account-id',
          name: 'BRI Account',
          currency: 'IDR',
          isActive: false,
        },
      ]);

      const result = await service.resolve('user-id', {
        ...baseIntent,
        accountHint: 'bri',
      });

      expect(result).toEqual({
        status: 'INVALID',
        message: 'The selected account is inactive',
      });
    });
  });

  it('resolves both transfer accounts and preserves their display names', async () => {
    accountsRepository.findByNameAndUserId.mockImplementation(
      async (name: string) => {
        if (name === 'BCA') {
          return {
            id: 'source-id',
            name: 'BCA Main Account',
            currency: 'IDR',
            isActive: true,
          };
        }
        if (name === 'Mandiri') {
          return {
            id: 'destination-id',
            name: 'Mandiri Account',
            currency: 'IDR',
            isActive: true,
          };
        }
        return null;
      },
    );

    const result = await service.resolve('user-id', {
      intent: 'TRANSFER',
      amount: 200000,
      description: 'Transfer antar rekening',
      sourceAccountHint: 'BCA',
      destinationAccountHint: 'Mandiri',
      source: 'DETERMINISTIC',
      confidence: 1,
    });

    expect(result.status).toBe('RESOLVED');
    expect(result.intent).toMatchObject({
      intent: 'TRANSFER',
      amount: 200000,
      sourceAccountId: 'source-id',
      destinationAccountId: 'destination-id',
      sourceAccountName: 'BCA Main Account',
      destinationAccountName: 'Mandiri Account',
    });
  });

  it('rejects a transfer between the same resolved account', async () => {
    accountsRepository.findByNameAndUserId.mockResolvedValue({
      id: 'same-account-id',
      name: 'BCA Main Account',
      currency: 'IDR',
      isActive: true,
    });

    const result = await service.resolve('user-id', {
      intent: 'TRANSFER',
      amount: 200000,
      sourceAccountHint: 'BCA',
      destinationAccountHint: 'BCA Main',
      source: 'DETERMINISTIC',
    });

    expect(result).toEqual({
      status: 'INVALID',
      message: 'Source and destination accounts must be different',
    });
  });
});
