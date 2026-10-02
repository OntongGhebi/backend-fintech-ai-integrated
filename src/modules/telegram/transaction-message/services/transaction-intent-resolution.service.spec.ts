import { TransactionIntentResolutionService } from './transaction-intent-resolution.service';

describe('TransactionIntentResolutionService', () => {
  let service: TransactionIntentResolutionService;

  let accountsRepository: {
    findByNameAndUserId: jest.Mock;
  };

  let categoriesRepository: {
    findByNameAndUserId: jest.Mock;
  };

  beforeEach(() => {
    accountsRepository = {
      findByNameAndUserId: jest.fn(),
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
      message: 'The selected category is not an expense category',
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
});
