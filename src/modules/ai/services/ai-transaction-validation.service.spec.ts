import { AI_TRANSACTION_MIN_INTENT_CONFIDENCE } from '../constants/ai-validation.constants';
import { AITransactionValidationService } from './ai-transaction-validation.service';

describe('AITransactionValidationService', () => {
  let service: AITransactionValidationService;

  beforeEach(() => {
    service = new AITransactionValidationService();
  });

  describe('validateIntent', () => {
    it('should accept a transaction intent above the confidence threshold', () => {
      const intent = {
        intent: 'CREATE_TRANSACTION' as const,
        confidence: AI_TRANSACTION_MIN_INTENT_CONFIDENCE,
      };

      const result = service.validateIntent(intent);

      expect(result).toEqual({
        valid: true,
        value: intent,
      });
    });

    it('should reject transaction intent below the confidence threshold', () => {
      const result = service.validateIntent({
        intent: 'CREATE_TRANSACTION',
        confidence: AI_TRANSACTION_MIN_INTENT_CONFIDENCE - 0.01,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('below the minimum threshold');
    });

    it('should reject invalid confidence', () => {
      const result = service.validateIntent({
        intent: 'CREATE_TRANSACTION',
        confidence: 1.5,
      });

      expect(result).toEqual({
        valid: false,
        reason: 'AI intent confidence is invalid',
      });
    });

    it('should reject non-transaction intent', () => {
      const result = service.validateIntent({
        intent: 'GENERAL_CHAT',
        confidence: 0.99,
      });

      expect(result).toEqual({
        valid: false,
        reason: 'AI intent is not supported for transaction creation',
      });
    });
  });

  describe('normalizeEntities', () => {
    it('should normalize transaction entity strings', () => {
      const result = service.normalizeEntities({
        type: 'EXPENSE',
        amount: 25000,
        description: '  beli   makan  ',
        accountHint: '  BCA  ',
        categoryHint: '  Makanan  ',
        destinationAccountHint: null,
      });

      expect(result).toEqual({
        valid: true,
        value: {
          type: 'EXPENSE',
          amount: 25000,
          description: 'beli makan',
          accountHint: 'BCA',
          categoryHint: 'Makanan',
          destinationAccountHint: null,
        },
      });
    });

    it('should reject zero amount', () => {
      const result = service.normalizeEntities({
        type: 'EXPENSE',
        amount: 0,
        description: 'makan',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result).toEqual({
        valid: false,
        reason: 'AI transaction amount is invalid',
      });
    });

    it('should reject negative amount', () => {
      const result = service.normalizeEntities({
        type: 'EXPENSE',
        amount: -1000,
        description: 'makan',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result).toEqual({
        valid: false,
        reason: 'AI transaction amount is invalid',
      });
    });

    it('should reject non-finite amount', () => {
      const result = service.normalizeEntities({
        type: 'EXPENSE',
        amount: Number.NaN,
        description: 'makan',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result).toEqual({
        valid: false,
        reason: 'AI transaction amount is invalid',
      });
    });

    it('should reject empty description', () => {
      const result = service.normalizeEntities({
        type: 'EXPENSE',
        amount: 25000,
        description: '   ',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result).toEqual({
        valid: false,
        reason: 'AI transaction description is required',
      });
    });

    it('should reject an invalid transaction type', () => {
      const result = service.normalizeEntities({
        type: 'INVALID' as never,
        amount: 25000,
        description: 'makan',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result).toEqual({
        valid: false,
        reason: 'AI transaction type is invalid',
      });
    });

    it('should reject destination account for non-transfer', () => {
      const result = service.normalizeEntities({
        type: 'EXPENSE',
        amount: 25000,
        description: 'makan',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        destinationAccountHint: 'Mandiri',
      });

      expect(result).toEqual({
        valid: false,
        reason: 'Destination account is only allowed for transfer transactions',
      });
    });

    it('should reject category for transfer', () => {
      const result = service.normalizeEntities({
        type: 'TRANSFER',
        amount: 500000,
        description: 'transfer',
        accountHint: 'BCA',
        categoryHint: 'Tabungan',
        destinationAccountHint: 'Mandiri',
      });

      expect(result).toEqual({
        valid: false,
        reason: 'Category is not allowed for transfer transactions',
      });
    });

    it('should reject transfer without destination account', () => {
      const result = service.normalizeEntities({
        type: 'TRANSFER',
        amount: 500000,
        description: 'transfer',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: null,
      });

      expect(result).toEqual({
        valid: false,
        reason: 'Transfer transaction requires a destination account',
      });
    });
  });

  describe('validateResolution', () => {
    it('should accept a valid expense resolution', () => {
      const entities = {
        type: 'EXPENSE' as const,
        amount: 25000,
        description: 'makan',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        destinationAccountHint: null,
      };

      const resolution = {
        account: {
          status: 'RESOLVED' as const,
          hint: 'BCA',
          account: {
            id: 'account-bca',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [],
        },
        destinationAccount: {
          status: 'NOT_REQUESTED' as const,
          hint: null,
          account: null,
          candidates: [],
        },
        category: {
          status: 'RESOLVED' as const,
          hint: 'Makanan',
          category: {
            id: 'category-food',
            name: 'Makanan',
            type: 'EXPENSE',
          },
          candidates: [],
        },
        ready: true,
      };

      const result = service.validateResolution(entities, resolution);

      expect(result).toEqual({
        valid: true,
        value: resolution,
      });
    });

    it('should reject non-IDR source account', () => {
      const result = service.validateResolution(
        {
          type: 'EXPENSE',
          amount: 25000,
          description: 'makan',
          accountHint: 'USD Account',
          categoryHint: null,
          destinationAccountHint: null,
        },
        {
          account: {
            status: 'RESOLVED',
            hint: 'USD Account',
            account: {
              id: 'account-usd',
              name: 'USD Account',
              type: 'BANK',
              currency: 'USD',
            },
            candidates: [],
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
        },
      );

      expect(result).toEqual({
        valid: false,
        reason: 'Resolved source account currency must be IDR',
      });
    });

    it('should reject the same source and destination account', () => {
      const result = service.validateResolution(
        {
          type: 'TRANSFER',
          amount: 500000,
          description: 'transfer',
          accountHint: 'BCA',
          categoryHint: null,
          destinationAccountHint: 'BCA',
        },
        {
          account: {
            status: 'RESOLVED',
            hint: 'BCA',
            account: {
              id: 'account-bca',
              name: 'BCA',
              type: 'BANK',
              currency: 'IDR',
            },
            candidates: [],
          },
          destinationAccount: {
            status: 'RESOLVED',
            hint: 'BCA',
            account: {
              id: 'account-bca',
              name: 'BCA',
              type: 'BANK',
              currency: 'IDR',
            },
            candidates: [],
          },
          category: {
            status: 'NOT_REQUESTED',
            hint: null,
            category: null,
            candidates: [],
          },
          ready: true,
        },
      );

      expect(result).toEqual({
        valid: false,
        reason: 'Source and destination accounts must be different',
      });
    });

    it('should reject an expense with an income category', () => {
      const result = service.validateResolution(
        {
          type: 'EXPENSE',
          amount: 25000,
          description: 'makan',
          accountHint: 'BCA',
          categoryHint: 'Gaji',
          destinationAccountHint: null,
        },
        {
          account: {
            status: 'RESOLVED',
            hint: 'BCA',
            account: {
              id: 'account-bca',
              name: 'BCA',
              type: 'BANK',
              currency: 'IDR',
            },
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
            hint: 'Gaji',
            category: {
              id: 'category-salary',
              name: 'Gaji',
              type: 'INCOME',
            },
            candidates: [],
          },
          ready: true,
        },
      );

      expect(result).toEqual({
        valid: false,
        reason: 'Resolved category type does not match transaction type',
      });
    });
  });

  describe('validateDraft', () => {
    it('should accept a consistent ready draft', () => {
      const entities = {
        type: 'EXPENSE' as const,
        amount: 25000,
        description: 'beli makan',
        accountHint: 'BCA',
        categoryHint: 'Makanan',
        destinationAccountHint: null,
      };

      const resolution = {
        account: {
          status: 'RESOLVED' as const,
          hint: 'BCA',
          account: {
            id: 'account-bca',
            name: 'BCA',
            type: 'BANK',
            currency: 'IDR',
          },
          candidates: [],
        },
        destinationAccount: {
          status: 'NOT_REQUESTED' as const,
          hint: null,
          account: null,
          candidates: [],
        },
        category: {
          status: 'RESOLVED' as const,
          hint: 'Makanan',
          category: {
            id: 'category-food',
            name: 'Makanan',
            type: 'EXPENSE',
          },
          candidates: [],
        },
        ready: true,
      };

      const draft = {
        type: 'EXPENSE' as const,
        amount: 25000,
        description: 'beli makan',
        accountId: 'account-bca',
        categoryId: 'category-food',
        destinationAccountId: null,
        currency: 'IDR' as const,
        status: 'READY' as const,
        ready: true,
        unresolvedFields: [],
      };

      const result = service.validateDraft(entities, resolution, draft);

      expect(result).toEqual({
        valid: true,
        value: draft,
      });
    });

    it('should reject a draft with mismatched account', () => {
      const result = service.validateDraft(
        {
          type: 'EXPENSE',
          amount: 25000,
          description: 'makan',
          accountHint: 'BCA',
          categoryHint: null,
          destinationAccountHint: null,
        },
        {
          account: {
            status: 'RESOLVED',
            hint: 'BCA',
            account: {
              id: 'account-bca',
              name: 'BCA',
              type: 'BANK',
              currency: 'IDR',
            },
            candidates: [],
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
        },
        {
          type: 'EXPENSE',
          amount: 25000,
          description: 'makan',
          accountId: 'account-other',
          categoryId: null,
          destinationAccountId: null,
          currency: 'IDR',
          status: 'READY',
          ready: true,
          unresolvedFields: [],
        },
      );

      expect(result).toEqual({
        valid: false,
        reason:
          'AI transaction draft account does not match account resolution',
      });
    });

    it('should reject a transfer draft with identical accounts', () => {
      const result = service.validateDraft(
        {
          type: 'TRANSFER',
          amount: 500000,
          description: 'transfer',
          accountHint: 'BCA',
          categoryHint: null,
          destinationAccountHint: 'BCA',
        },
        {
          account: {
            status: 'RESOLVED',
            hint: 'BCA',
            account: {
              id: 'account-bca',
              name: 'BCA',
              type: 'BANK',
              currency: 'IDR',
            },
            candidates: [],
          },
          destinationAccount: {
            status: 'RESOLVED',
            hint: 'BCA',
            account: {
              id: 'account-bca',
              name: 'BCA',
              type: 'BANK',
              currency: 'IDR',
            },
            candidates: [],
          },
          category: {
            status: 'NOT_REQUESTED',
            hint: null,
            category: null,
            candidates: [],
          },
          ready: true,
        },
        {
          type: 'TRANSFER',
          amount: 500000,
          description: 'transfer',
          accountId: 'account-bca',
          categoryId: null,
          destinationAccountId: 'account-bca',
          currency: 'IDR',
          status: 'READY',
          ready: true,
          unresolvedFields: [],
        },
      );

      expect(result).toEqual({
        valid: false,
        reason: 'Transfer source and destination accounts must be different',
      });
    });
  });
});
