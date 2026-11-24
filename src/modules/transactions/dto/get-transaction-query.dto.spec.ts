import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GetTransactionsQueryDto } from './get-transaction-query.dto';

describe('GetTransactionsQueryDto', () => {
  async function validateQuery(input: Record<string, unknown>) {
    const dto = plainToInstance(GetTransactionsQueryDto, input);

    return validate(dto);
  }

  describe('date range validation', () => {
    it('should accept a valid date range', async () => {
      const errors = await validateQuery({
        startDate: '2026-09-01T00:00:00+07:00',
        endDate: '2026-09-30T23:59:59+07:00',
      });

      expect(errors).toHaveLength(0);
    });

    it('should accept the same start and end date', async () => {
      const errors = await validateQuery({
        startDate: '2026-09-15T10:00:00+07:00',
        endDate: '2026-09-15T10:00:00+07:00',
      });

      expect(errors).toHaveLength(0);
    });

    it('should reject an end date earlier than the start date', async () => {
      const errors = await validateQuery({
        startDate: '2026-09-30T00:00:00+07:00',
        endDate: '2026-09-01T00:00:00+07:00',
      });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('endDate');
      expect(errors[0].constraints?.endDateAfterOrEqualStartDate).toBe(
        'endDate must be greater than or equal to startDate',
      );
    });

    it('should accept startDate without endDate', async () => {
      const errors = await validateQuery({
        startDate: '2026-09-01T00:00:00+07:00',
      });

      expect(errors).toHaveLength(0);
    });

    it('should accept endDate without startDate', async () => {
      const errors = await validateQuery({
        endDate: '2026-09-30T23:59:59+07:00',
      });

      expect(errors).toHaveLength(0);
    });

    it('should reject an invalid start date', async () => {
      const errors = await validateQuery({
        startDate: 'not-a-date',
        endDate: '2026-09-30T23:59:59+07:00',
      });

      expect(errors.some((error) => error.property === 'startDate')).toBe(true);
    });

    it('should reject an invalid end date', async () => {
      const errors = await validateQuery({
        startDate: '2026-09-01T00:00:00+07:00',
        endDate: 'not-a-date',
      });

      expect(errors.some((error) => error.property === 'endDate')).toBe(true);
    });
  });

  describe('pagination validation', () => {
    it('should accept valid page and limit values', async () => {
      const errors = await validateQuery({
        page: '2',
        limit: '50',
      });

      expect(errors).toHaveLength(0);
    });

    it('should reject page less than one', async () => {
      const errors = await validateQuery({
        page: '0',
      });

      expect(errors.some((error) => error.property === 'page')).toBe(true);
    });

    it('should reject limit greater than 100', async () => {
      const errors = await validateQuery({
        limit: '101',
      });

      expect(errors.some((error) => error.property === 'limit')).toBe(true);
    });

    it('should reject non-integer pagination values', async () => {
      const errors = await validateQuery({
        page: '1.5',
        limit: '10.5',
      });

      expect(errors.some((error) => error.property === 'page')).toBe(true);
      expect(errors.some((error) => error.property === 'limit')).toBe(true);
    });
  });
});
