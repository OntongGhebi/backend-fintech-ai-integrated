import { Test, TestingModule } from '@nestjs/testing';

import { AITransactionDraftService } from './ai-transaction-draft.service';

import { AITransactionEntities } from '../types/ai-transaction.types';
import { AITransactionResolutionResult } from '../types/ai-transaction-resolution.types';

describe('AITransactionDraftService', () => {
  let service: AITransactionDraftService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AITransactionDraftService],
    }).compile();

    service = module.get<AITransactionDraftService>(AITransactionDraftService);
  });

  describe('expense transaction', () => {
    it('should build a ready expense draft when account and category are resolved', () => {
      const entities: AITransactionEntities = {
        type: 'EXPENSE',
        amount: 50000,
        description: 'makan siang',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        destinationAccountHint: null,
      };

      const resolution: AITransactionResolutionResult = {
        account: {
          status: 'RESOLVED',
          hint: 'BCA',
          account: {
            id: 'account-1',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [
            {
              id: 'account-1',
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
          hint: 'Makanan',
          category: {
            id: 'category-1',
            name: 'Makanan',
            type: 'EXPENSE',
          },
          candidates: [
            {
              id: 'category-1',
              name: 'Makanan',
              type: 'EXPENSE',
            },
          ],
        },

        ready: true,
      };

      const result = service.buildDraft(entities, resolution);

      expect(result).toEqual({
        type: 'EXPENSE',
        amount: 50000,
        description: 'makan siang',

        accountId: 'account-1',
        categoryId: 'category-1',
        destinationAccountId: null,

        currency: 'IDR',

        status: 'READY',
        ready: true,

        unresolvedFields: [],
      });
    });

    it('should require account resolution when account is unresolved', () => {
      const entities: AITransactionEntities = {
        type: 'EXPENSE',
        amount: 50000,
        description: 'makan siang',
        accountHint: 'rekening utama',
        categoryHint: 'Makanan',
        destinationAccountHint: null,
      };

      const resolution: AITransactionResolutionResult = {
        account: {
          status: 'UNRESOLVED',
          hint: 'rekening utama',
          account: null,
          candidates: [],
        },

        destinationAccount: {
          status: 'NOT_REQUESTED',
          hint: null,
          account: null,
          candidates: [],
        },

        category: {
          status: 'RESOLVED',
          hint: 'Makanan',
          category: {
            id: 'category-1',
            name: 'Makanan',
            type: 'EXPENSE',
          },
          candidates: [
            {
              id: 'category-1',
              name: 'Makanan',
              type: 'EXPENSE',
            },
          ],
        },

        ready: false,
      };

      const result = service.buildDraft(entities, resolution);

      expect(result.ready).toBe(false);
      expect(result.status).toBe('NEEDS_RESOLUTION');

      expect(result.accountId).toBeNull();
      expect(result.categoryId).toBe('category-1');

      expect(result.unresolvedFields).toEqual(['account']);
    });

    it('should require category resolution when category is ambiguous', () => {
      const entities: AITransactionEntities = {
        type: 'EXPENSE',
        amount: 50000,
        description: 'makan',
        accountHint: 'BCA',
        categoryHint: 'makanan',
        destinationAccountHint: null,
      };

      const resolution: AITransactionResolutionResult = {
        account: {
          status: 'RESOLVED',
          hint: 'BCA',
          account: {
            id: 'account-1',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [
            {
              id: 'account-1',
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
          status: 'AMBIGUOUS',
          hint: 'makanan',
          category: null,
          candidates: [
            {
              id: 'category-1',
              name: 'Makanan',
              type: 'EXPENSE',
            },
            {
              id: 'category-2',
              name: 'Makanan & Minuman',
              type: 'EXPENSE',
            },
          ],
        },

        ready: false,
      };

      const result = service.buildDraft(entities, resolution);

      expect(result.ready).toBe(false);
      expect(result.status).toBe('NEEDS_RESOLUTION');

      expect(result.categoryId).toBeNull();

      expect(result.unresolvedFields).toEqual(['category']);
    });

    it('should allow expense transaction without a category', () => {
      const entities: AITransactionEntities = {
        type: 'EXPENSE',
        amount: 25000,
        description: 'parkir',
        accountHint: 'Cash',
        categoryHint: null,
        destinationAccountHint: null,
      };

      const resolution: AITransactionResolutionResult = {
        account: {
          status: 'RESOLVED',
          hint: 'Cash',
          account: {
            id: 'account-1',
            name: 'Cash',
            type: 'CASH',
            currency: 'IDR',
          },
          candidates: [
            {
              id: 'account-1',
              name: 'Cash',
              type: 'CASH',
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
          status: 'NOT_REQUESTED',
          hint: null,
          category: null,
          candidates: [],
        },

        ready: true,
      };

      const result = service.buildDraft(entities, resolution);

      expect(result.ready).toBe(true);
      expect(result.status).toBe('READY');

      expect(result.accountId).toBe('account-1');
      expect(result.categoryId).toBeNull();

      expect(result.unresolvedFields).toEqual([]);
    });
  });

  describe('income transaction', () => {
    it('should build a ready income draft', () => {
      const entities: AITransactionEntities = {
        type: 'INCOME',
        amount: 5000000,
        description: 'gaji bulan september',
        accountHint: 'BCA',
        categoryHint: 'Gaji',
        destinationAccountHint: null,
      };

      const resolution: AITransactionResolutionResult = {
        account: {
          status: 'RESOLVED',
          hint: 'BCA',
          account: {
            id: 'account-1',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [
            {
              id: 'account-1',
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
          hint: 'Gaji',
          category: {
            id: 'category-1',
            name: 'Gaji',
            type: 'INCOME',
          },
          candidates: [
            {
              id: 'category-1',
              name: 'Gaji',
              type: 'INCOME',
            },
          ],
        },

        ready: true,
      };

      const result = service.buildDraft(entities, resolution);

      expect(result.type).toBe('INCOME');
      expect(result.amount).toBe(5000000);
      expect(result.accountId).toBe('account-1');
      expect(result.categoryId).toBe('category-1');

      expect(result.destinationAccountId).toBeNull();

      expect(result.ready).toBe(true);
      expect(result.status).toBe('READY');
      expect(result.unresolvedFields).toEqual([]);
    });
  });

  describe('transfer transaction', () => {
    it('should build a ready transfer draft when both accounts are resolved', () => {
      const entities: AITransactionEntities = {
        type: 'TRANSFER',
        amount: 100000,
        description: 'transfer ke tabungan',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: 'Jago',
      };

      const resolution: AITransactionResolutionResult = {
        account: {
          status: 'RESOLVED',
          hint: 'BCA',
          account: {
            id: 'account-1',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [
            {
              id: 'account-1',
              name: 'BCA',
              type: 'BANK',
              currency: 'IDR',
            },
          ],
        },

        destinationAccount: {
          status: 'RESOLVED',
          hint: 'Jago',
          account: {
            id: 'account-2',
            name: 'Jago',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [
            {
              id: 'account-2',
              name: 'Jago',
              type: 'BANK',
              currency: 'IDR',
            },
          ],
        },

        category: {
          status: 'NOT_REQUESTED',
          hint: null,
          category: null,
          candidates: [],
        },

        ready: true,
      };

      const result = service.buildDraft(entities, resolution);

      expect(result.type).toBe('TRANSFER');

      expect(result.accountId).toBe('account-1');
      expect(result.destinationAccountId).toBe('account-2');

      expect(result.categoryId).toBeNull();

      expect(result.ready).toBe(true);
      expect(result.status).toBe('READY');

      expect(result.unresolvedFields).toEqual([]);
    });

    it('should require destination account when it is unresolved', () => {
      const entities: AITransactionEntities = {
        type: 'TRANSFER',
        amount: 100000,
        description: 'transfer ke tabungan',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: 'Tabungan',
      };

      const resolution: AITransactionResolutionResult = {
        account: {
          status: 'RESOLVED',
          hint: 'BCA',
          account: {
            id: 'account-1',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [
            {
              id: 'account-1',
              name: 'BCA',
              type: 'BANK',
              currency: 'IDR',
            },
          ],
        },

        destinationAccount: {
          status: 'UNRESOLVED',
          hint: 'Tabungan',
          account: null,
          candidates: [],
        },

        category: {
          status: 'NOT_REQUESTED',
          hint: null,
          category: null,
          candidates: [],
        },

        ready: false,
      };

      const result = service.buildDraft(entities, resolution);

      expect(result.ready).toBe(false);
      expect(result.status).toBe('NEEDS_RESOLUTION');

      expect(result.accountId).toBe('account-1');
      expect(result.destinationAccountId).toBeNull();

      expect(result.unresolvedFields).toEqual(['destinationAccount']);
    });
  });

  describe('multiple unresolved fields', () => {
    it('should return all unresolved fields', () => {
      const entities: AITransactionEntities = {
        type: 'EXPENSE',
        amount: 75000,
        description: 'makan malam',
        accountHint: 'rekening',
        categoryHint: 'makanan',
        destinationAccountHint: null,
      };

      const resolution: AITransactionResolutionResult = {
        account: {
          status: 'AMBIGUOUS',
          hint: 'rekening',
          account: null,
          candidates: [],
        },

        destinationAccount: {
          status: 'NOT_REQUESTED',
          hint: null,
          account: null,
          candidates: [],
        },

        category: {
          status: 'UNRESOLVED',
          hint: 'makanan',
          category: null,
          candidates: [],
        },

        ready: false,
      };

      const result = service.buildDraft(entities, resolution);

      expect(result.ready).toBe(false);
      expect(result.status).toBe('NEEDS_RESOLUTION');

      expect(result.unresolvedFields).toEqual(['account', 'category']);
    });
  });
});
