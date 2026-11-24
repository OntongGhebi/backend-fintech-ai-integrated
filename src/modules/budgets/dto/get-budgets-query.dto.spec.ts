import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { BudgetStatus } from 'src/database/enums/budget-status.enum';

import { GetBudgetsQueryDto } from './get-budgets-query.dto';

describe('GetBudgetsQueryDto', () => {
  async function validateQuery(input: Record<string, unknown> = {}) {
    const dto = plainToInstance(GetBudgetsQueryDto, input);
    const errors = await validate(dto);

    return { dto, errors };
  }

  describe('status filter', () => {
    it.each(Object.values(BudgetStatus))(
      'should accept budget status %s',
      async (status) => {
        const { dto, errors } = await validateQuery({ status });

        expect(errors).toHaveLength(0);
        expect(dto.status).toBe(status);
      },
    );

    it('should reject an unsupported budget status', async () => {
      const { errors } = await validateQuery({
        status: 'ARCHIVED',
      });

      expect(errors.some((error) => error.property === 'status')).toBe(true);
    });

    it('should allow status to be omitted', async () => {
      const { dto, errors } = await validateQuery();

      expect(errors).toHaveLength(0);
      expect(dto.status).toBeUndefined();
    });
  });

  describe('month filter', () => {
    it.each(['2026-01-01', '2026-02-01', '2026-11-01', '2027-12-01'])(
      'should accept valid month %s',
      async (month) => {
        const { dto, errors } = await validateQuery({ month });

        expect(errors).toHaveLength(0);
        expect(dto.month).toBe(month);
      },
    );

    it.each([
      '2026-11-02',
      '2026-11-30',
      '2026-1-01',
      '26-11-01',
      '2026/11/01',
      '2026-11',
      'invalid',
      '',
    ])('should reject invalid month format %s', async (month) => {
      const { errors } = await validateQuery({ month });

      expect(errors.some((error) => error.property === 'month')).toBe(true);
    });

    it.each(['2026-00-01', '2026-13-01', '2026-02-30', '2026-99-01'])(
      'should reject impossible calendar month %s',
      async (month) => {
        const { errors } = await validateQuery({ month });

        expect(errors.some((error) => error.property === 'month')).toBe(true);
      },
    );

    it('should allow month to be omitted', async () => {
      const { dto, errors } = await validateQuery();

      expect(errors).toHaveLength(0);
      expect(dto.month).toBeUndefined();
    });
  });

  describe('combined filters', () => {
    it('should accept status and month together', async () => {
      const { dto, errors } = await validateQuery({
        status: BudgetStatus.ACTIVE,
        month: '2026-11-01',
      });

      expect(errors).toHaveLength(0);
      expect(dto).toEqual({
        status: BudgetStatus.ACTIVE,
        month: '2026-11-01',
      });
    });

    it('should reject invalid status and month together', async () => {
      const { errors } = await validateQuery({
        status: 'INVALID',
        month: '2026-11-15',
      });

      expect(errors).toHaveLength(2);

      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['status', 'month']),
      );
    });

    it('should accept an empty query', async () => {
      const { errors } = await validateQuery({});

      expect(errors).toHaveLength(0);
    });
  });
});
