import {
  getBudgetMonthRange,
  getBudgetMonthRanges,
  getZonedDateBoundary,
  getZonedNextDateBoundary,
} from './budget-month.util';

describe('budget-month.util', () => {
  it('resolves the allocation month using the configured timezone', () => {
    const range = getBudgetMonthRange(
      new Date('2026-10-31T18:00:00.000Z'),
      'Asia/Jakarta',
    );

    expect(range.periodStart).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    expect(range.periodEndDate).toEqual(new Date('2026-11-30T00:00:00.000Z'));
    expect(range.start).toEqual(new Date('2026-10-31T17:00:00.000Z'));
    expect(range.end).toEqual(new Date('2026-11-30T17:00:00.000Z'));
    expect(range.localDate).toEqual(new Date('2026-11-01T00:00:00.000Z'));
  });

  it('resolves date-only budget boundaries as local midnight', () => {
    expect(
      getZonedDateBoundary(
        new Date('2026-11-01T00:00:00.000Z'),
        'Asia/Jakarta',
      ),
    ).toEqual(new Date('2026-10-31T17:00:00.000Z'));

    expect(
      getZonedNextDateBoundary(
        new Date('2026-11-30T00:00:00.000Z'),
        'Asia/Jakarta',
      ),
    ).toEqual(new Date('2026-11-30T17:00:00.000Z'));
  });

  it('supports timezone-specific month boundaries', () => {
    const range = getBudgetMonthRange(
      new Date('2026-11-01T04:30:00.000Z'),
      'America/New_York',
    );

    expect(range.periodStart).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    expect(range.start).toEqual(new Date('2026-11-01T04:00:00.000Z'));
  });

  it('returns all allocation months touched by a date range', () => {
    const ranges = getBudgetMonthRanges(
      new Date('2026-09-10T00:00:00.000Z'),
      new Date('2026-11-20T00:00:00.000Z'),
      'Asia/Jakarta',
    );

    expect(ranges.map((range) => range.periodStart.toISOString())).toEqual([
      '2026-09-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
    ]);
  });

  it('rejects invalid dates', () => {
    expect(() => getBudgetMonthRange(new Date('invalid'))).toThrow(RangeError);
  });
});
