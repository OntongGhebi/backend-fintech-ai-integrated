import { AITransactionEntityExtractorService } from './ai-transaction-entity-extractor.service';
import { AITransactionResolutionService } from './ai-transaction-resolution.service';
import { PrismaService } from '../../../database/prisma/prisma.service';

describe('AITransactionResolutionService', () => {
  let service: AITransactionResolutionService;

  const prisma = {
    account: {
      findMany: jest.fn(),
    },
    category: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AITransactionResolutionService(
      prisma as unknown as PrismaService,
    );
  });

  describe('resolve', () => {
    it('should resolve an expense account and category', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      prisma.category.findMany.mockResolvedValue([
        {
          id: 'category-food',
          name: 'Makanan',
          type: 'EXPENSE',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'EXPENSE',
        amount: 45000,
        description: 'makan di kfc',
        accountHint: 'bca',
        categoryHint: 'makanan',
        destinationAccountHint: null,
      });

      expect(result).toEqual({
        account: {
          status: 'RESOLVED',
          hint: 'bca',
          account: {
            id: 'account-bca',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [
            {
              id: 'account-bca',
              name: 'BCA',
              type: 'BANK',
              currency: 'IDR',
            },
          ],
        },
        destinationAccount: {
          status: 'NOT_REQUESTED',
          hint: null,
          account: null,
          candidates: [],
        },
        category: {
          status: 'RESOLVED',
          hint: 'makanan',
          category: {
            id: 'category-food',
            name: 'Makanan',
            type: 'EXPENSE',
          },
          candidates: [
            {
              id: 'category-food',
              name: 'Makanan',
              type: 'EXPENSE',
            },
          ],
        },
        ready: true,
      });
    });

    it('should resolve an income category using only income categories', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      prisma.category.findMany.mockResolvedValue([
        {
          id: 'category-salary',
          name: 'Gaji',
          type: 'INCOME',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'INCOME',
        amount: 7500000,
        description: 'gajian',
        accountHint: 'BCA',
        categoryHint: 'gaji',
        destinationAccountHint: null,
      });

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-id',
            type: 'INCOME',
            isActive: true,
            deletedAt: null,
          }),
        }),
      );

      expect(result.category.status).toBe('RESOLVED');

      expect(result.ready).toBe(true);
    });

    it('should not resolve an expense category for an income transaction', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      prisma.category.findMany.mockResolvedValue([
        {
          id: 'category-food',
          name: 'Makanan',
          type: 'EXPENSE',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'INCOME',
        amount: 500000,
        description: 'bonus',
        accountHint: 'BCA',
        categoryHint: 'makanan',
        destinationAccountHint: null,
      });

      expect(result.category.status).toBe('UNRESOLVED');

      expect(result.ready).toBe(false);
    });

    it('should resolve both accounts for a transfer', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
        {
          id: 'account-mandiri',
          name: 'Mandiri',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'TRANSFER',
        amount: 500000,
        description: 'transfer',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: 'Mandiri',
      });

      expect(result.account.status).toBe('RESOLVED');

      expect(result.destinationAccount.status).toBe('RESOLVED');

      expect(result.category.status).toBe('NOT_REQUESTED');

      expect(result.ready).toBe(true);
    });

    it('should not be ready when transfer destination is missing', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'TRANSFER',
        amount: 500000,
        description: 'transfer',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result.account.status).toBe('RESOLVED');

      expect(result.destinationAccount.status).toBe('NOT_REQUESTED');

      expect(result.ready).toBe(false);
    });

    it('should resolve an account using case-insensitive matching', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'EXPENSE',
        amount: 20000,
        description: 'kopi',
        accountHint: ' bCa ',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result.account.status).toBe('RESOLVED');

      expect(result.account.account?.id).toBe('account-bca');

      expect(result.ready).toBe(true);
    });

    it('should resolve an account using startsWith matching', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca-digital',
          name: 'BCA Digital',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'EXPENSE',
        amount: 20000,
        description: 'kopi',
        accountHint: 'bca',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result.account.status).toBe('RESOLVED');

      expect(result.account.account?.id).toBe('account-bca-digital');
    });

    it('should resolve an account using contains matching', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bank-bca',
          name: 'Bank BCA Utama',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'EXPENSE',
        amount: 20000,
        description: 'kopi',
        accountHint: 'bca',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result.account.status).toBe('RESOLVED');

      expect(result.account.account?.id).toBe('account-bank-bca');
    });

    it('should return ambiguous when multiple accounts match', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
        {
          id: 'account-bca-digital',
          name: 'BCA Digital',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'EXPENSE',
        amount: 20000,
        description: 'kopi',
        accountHint: 'bca',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result.account.status).toBe('AMBIGUOUS');

      expect(result.account.account).toBeNull();

      expect(result.account.candidates).toHaveLength(2);

      expect(result.ready).toBe(false);
    });

    it('should return unresolved when account does not exist', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.resolve('user-id', {
        type: 'EXPENSE',
        amount: 20000,
        description: 'kopi',
        accountHint: 'ovo',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result.account.status).toBe('UNRESOLVED');

      expect(result.account.account).toBeNull();

      expect(result.ready).toBe(false);
    });

    it('should allow an expense without a category hint', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'EXPENSE',
        amount: 20000,
        description: 'kopi',
        accountHint: 'bca',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result.category.status).toBe('NOT_REQUESTED');

      expect(result.ready).toBe(true);

      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('should not resolve a category for a transfer', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
        {
          id: 'account-mandiri',
          name: 'Mandiri',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      const result = await service.resolve('user-id', {
        type: 'TRANSFER',
        amount: 500000,
        description: 'transfer',
        accountHint: 'BCA',
        categoryHint: 'makanan',
        destinationAccountHint: 'Mandiri',
      });

      expect(result.category.status).toBe('NOT_REQUESTED');

      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('should ignore inactive and deleted accounts', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.resolve('user-id', {
        type: 'EXPENSE',
        amount: 20000,
        description: 'kopi',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-id',
            isActive: true,
            deletedAt: null,
            currency: 'IDR',
          },
        }),
      );
    });

    it('should ignore inactive and deleted categories', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      prisma.category.findMany.mockResolvedValue([]);

      await service.resolve('user-id', {
        type: 'EXPENSE',
        amount: 20000,
        description: 'kopi',
        accountHint: 'BCA',
        categoryHint: 'makanan',
        destinationAccountHint: null,
      });

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-id',
            type: 'EXPENSE',
            isActive: true,
            deletedAt: null,
          },
        }),
      );
    });

    it('should isolate resolution by user id', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'account-user-a',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
      ]);

      await service.resolve('user-a', {
        type: 'EXPENSE',
        amount: 20000,
        description: 'kopi',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-a',
          }),
        }),
      );
    });
  });
});
