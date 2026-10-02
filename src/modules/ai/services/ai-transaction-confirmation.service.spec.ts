import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AITransactionConfirmationService } from './ai-transaction-confirmation.service';

import { AITransactionDraft } from '../types/ai-transaction-draft.types';

describe('AITransactionConfirmationService', () => {
  let service: AITransactionConfirmationService;

  const baseDraft: AITransactionDraft = {
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AITransactionConfirmationService],
    }).compile();

    service = module.get<AITransactionConfirmationService>(
      AITransactionConfirmationService,
    );
  });

  describe('prepare', () => {
    it('should create a pending confirmation for a ready draft', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const result = service.prepare(baseDraft, now);

      expect(result.confirmation.id).toEqual(expect.any(String));

      expect(result.confirmation.status).toBe('PENDING');

      expect(result.confirmation.draft).toEqual(baseDraft);

      expect(result.confirmation.createdAt).toEqual(now);

      expect(result.confirmation.expiresAt).toEqual(
        new Date('2026-10-02T10:05:00.000Z'),
      );

      expect(result.message).toContain('Please confirm this transaction:');

      expect(result.message).toContain('Type: EXPENSE');

      expect(result.message).toContain('Amount: IDR 50.000');

      expect(result.message).toContain('Description: makan siang');

      expect(result.message).toContain('Confirm this transaction?');
    });

    it('should reject a draft that is not ready', () => {
      const draft: AITransactionDraft = {
        ...baseDraft,
        status: 'NEEDS_RESOLUTION',
        ready: false,
        unresolvedFields: ['account'],
        accountId: null,
      };

      expect(() =>
        service.prepare(draft, new Date('2026-10-02T10:00:00.000Z')),
      ).toThrow(BadRequestException);
    });

    it('should reject a draft with unresolved fields', () => {
      const draft: AITransactionDraft = {
        ...baseDraft,
        status: 'READY',
        ready: false,
        unresolvedFields: ['category'],
        categoryId: null,
      };

      expect(() =>
        service.prepare(draft, new Date('2026-10-02T10:00:00.000Z')),
      ).toThrow('Transaction draft is not ready for confirmation');
    });

    it('should create a five-minute expiration window', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const result = service.prepare(baseDraft, now);

      const duration =
        result.confirmation.expiresAt.getTime() -
        result.confirmation.createdAt.getTime();

      expect(duration).toBe(5 * 60 * 1000);
    });
  });

  describe('confirm', () => {
    it('should confirm a pending confirmation', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const prepared = service.prepare(baseDraft, now);

      const result = service.confirm(
        prepared.confirmation,
        new Date('2026-10-02T10:01:00.000Z'),
      );

      expect(result.action).toBe('CONFIRM');

      expect(result.confirmation.status).toBe('CONFIRMED');

      expect(result.confirmation.id).toBe(prepared.confirmation.id);

      expect(result.message).toBe(
        'Transaction confirmed and ready to be processed.',
      );
    });

    it('should reject an already confirmed confirmation', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const prepared = service.prepare(baseDraft, now);

      const confirmed = service.confirm(
        prepared.confirmation,
        new Date('2026-10-02T10:01:00.000Z'),
      );

      expect(() =>
        service.confirm(
          confirmed.confirmation,
          new Date('2026-10-02T10:02:00.000Z'),
        ),
      ).toThrow('Transaction confirmation is already confirmed');
    });

    it('should reject an expired confirmation', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const prepared = service.prepare(baseDraft, now);

      expect(() =>
        service.confirm(
          prepared.confirmation,
          new Date('2026-10-02T10:05:00.000Z'),
        ),
      ).toThrow('Transaction confirmation has expired');
    });
  });

  describe('cancel', () => {
    it('should cancel a pending confirmation', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const prepared = service.prepare(baseDraft, now);

      const result = service.cancel(
        prepared.confirmation,
        new Date('2026-10-02T10:01:00.000Z'),
      );

      expect(result.action).toBe('CANCEL');

      expect(result.confirmation.status).toBe('CANCELLED');

      expect(result.message).toBe('Transaction confirmation cancelled.');
    });

    it('should reject cancellation after confirmation', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const prepared = service.prepare(baseDraft, now);

      const confirmed = service.confirm(
        prepared.confirmation,
        new Date('2026-10-02T10:01:00.000Z'),
      );

      expect(() =>
        service.cancel(
          confirmed.confirmation,
          new Date('2026-10-02T10:02:00.000Z'),
        ),
      ).toThrow('Transaction confirmation is already confirmed');
    });

    it('should reject cancellation after expiration', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const prepared = service.prepare(baseDraft, now);

      expect(() =>
        service.cancel(
          prepared.confirmation,
          new Date('2026-10-02T10:05:00.000Z'),
        ),
      ).toThrow('Transaction confirmation has expired');
    });
  });

  describe('isExpired', () => {
    it('should return false before expiration', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const prepared = service.prepare(baseDraft, now);

      expect(
        service.isExpired(
          prepared.confirmation,
          new Date('2026-10-02T10:04:59.999Z'),
        ),
      ).toBe(false);
    });

    it('should return true at expiration time', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const prepared = service.prepare(baseDraft, now);

      expect(
        service.isExpired(
          prepared.confirmation,
          new Date('2026-10-02T10:05:00.000Z'),
        ),
      ).toBe(true);
    });

    it('should return true after expiration', () => {
      const now = new Date('2026-10-02T10:00:00.000Z');

      const prepared = service.prepare(baseDraft, now);

      expect(
        service.isExpired(
          prepared.confirmation,
          new Date('2026-10-02T10:06:00.000Z'),
        ),
      ).toBe(true);
    });
  });
});
