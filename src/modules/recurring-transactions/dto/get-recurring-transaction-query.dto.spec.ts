import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RecurringFrequency } from 'src/database/enums/recurring-frequency.enum';
import { TransactionType } from 'src/database/enums/transaction-type.enum';

import { GetRecurringTransactionsQueryDto } from './get-recurring-transaction-query.dto';

describe('GetRecurringTransactionsQueryDto', () => {
  async function validateQuery(input: Record<string, unknown>) {
    const dto = plainToInstance(GetRecurringTransactionsQueryDto, input);

    const errors = await validate(dto);

    return { dto, errors };
  }

  describe('type filter', () => {
    it.each(Object.values(TransactionType))(
      'should accept transaction type %s',
      async (type) => {
        const { dto, errors } = await validateQuery({ type });

        expect(errors).toHaveLength(0);
        expect(dto.type).toBe(type);
      },
    );

    it('should reject unsupported transaction types', async () => {
      const { errors } = await validateQuery({
        type: 'INVALID',
      });

      expect(errors.some((error) => error.property === 'type')).toBe(true);
    });
  });

  describe('frequency filter', () => {
    it.each(Object.values(RecurringFrequency))(
      'should accept frequency %s',
      async (frequency) => {
        const { dto, errors } = await validateQuery({ frequency });

        expect(errors).toHaveLength(0);
        expect(dto.frequency).toBe(frequency);
      },
    );

    it('should reject unsupported frequencies', async () => {
      const { errors } = await validateQuery({
        frequency: 'HOURLY',
      });

      expect(errors.some((error) => error.property === 'frequency')).toBe(true);
    });
  });

  describe('isActive filter', () => {
    it.each([
      ['true', true],
      ['false', false],
    ])(
      'should convert query value %s to boolean %s',
      async (input, expected) => {
        const { dto, errors } = await validateQuery({
          isActive: input,
        });

        expect(errors).toHaveLength(0);
        expect(dto.isActive).toBe(expected);
        expect(typeof dto.isActive).toBe('boolean');
      },
    );

    it('should accept an actual boolean true', async () => {
      const { dto, errors } = await validateQuery({
        isActive: true,
      });

      expect(errors).toHaveLength(0);
      expect(dto.isActive).toBe(true);
    });

    it('should accept an actual boolean false', async () => {
      const { dto, errors } = await validateQuery({
        isActive: false,
      });

      expect(errors).toHaveLength(0);
      expect(dto.isActive).toBe(false);
    });

    it.each(['yes', 'no', '1', '0', 'TRUE', 'FALSE', ''])(
      'should reject unsupported boolean query value %s',
      async (isActive) => {
        const { errors } = await validateQuery({ isActive });

        expect(errors.some((error) => error.property === 'isActive')).toBe(
          true,
        );
      },
    );
  });

  describe('combined filters', () => {
    it('should accept all supported filters together', async () => {
      const { dto, errors } = await validateQuery({
        type: TransactionType.EXPENSE,
        frequency: RecurringFrequency.MONTHLY,
        isActive: 'true',
      });

      expect(errors).toHaveLength(0);
      expect(dto).toEqual({
        type: TransactionType.EXPENSE,
        frequency: RecurringFrequency.MONTHLY,
        isActive: true,
      });
    });

    it('should accept an empty query', async () => {
      const { errors } = await validateQuery({});

      expect(errors).toHaveLength(0);
    });

    it('should reject multiple invalid filters together', async () => {
      const { errors } = await validateQuery({
        type: 'UNKNOWN',
        frequency: 'HOURLY',
        isActive: 'enabled',
      });

      expect(errors).toHaveLength(3);

      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['type', 'frequency', 'isActive']),
      );
    });
  });
});
