import { Prisma } from '../../../generated/prisma/client.js';
import { calculateAccountBalance } from './account-balance.util';

describe('calculateAccountBalance', () => {
  it('calculates opening balance plus income minus expenses and transfers out', () => {
    const balance = calculateAccountBalance('100000.0000', [
      { type: 'INCOME', amount: '50000.0000', metadata: null },
      { type: 'EXPENSE', amount: '25000.0000', metadata: null },
      {
        type: 'TRANSFER',
        amount: '10000.0000',
        metadata: { direction: 'OUT' },
      },
      {
        type: 'TRANSFER',
        amount: '5000.0000',
        metadata: { direction: 'IN' },
      },
    ]);

    expect(balance.toFixed(4)).toBe('120000.0000');
  });

  it('uses exact decimal arithmetic for fractional amounts', () => {
    const balance = calculateAccountBalance(new Prisma.Decimal('0.1000'), [
      { type: 'INCOME', amount: '0.2000', metadata: null },
      { type: 'EXPENSE', amount: '0.1001', metadata: null },
    ]);

    expect(balance.toFixed(4)).toBe('0.1999');
  });

  it('keeps the balance unchanged for unknown transfer directions', () => {
    const balance = calculateAccountBalance('100.0000', [
      {
        type: 'TRANSFER',
        amount: '50.0000',
        metadata: { direction: 'UNKNOWN' },
      },
    ]);

    expect(balance.toFixed(4)).toBe('100.0000');
  });
});
