export interface BudgetMonthRange {
  /** UTC date-only value persisted in BudgetAllocation.periodStart. */
  periodStart: Date;
  /** UTC date-only value for the last calendar day of the month. */
  periodEndDate: Date;
  /** UTC instant representing local midnight at the beginning of the month. */
  start: Date;
  /** UTC instant representing local midnight at the beginning of next month. */
  end: Date;
  /** UTC date-only value for the transaction's local calendar day. */
  localDate: Date;
}

/**
 * Resolves a transaction instant to its calendar month in the user's timezone.
 * Allocation periodStart remains a UTC date-only value, while start/end are
 * timezone-aware instants for querying timestamptz transactionDate values.
 */
export function getBudgetMonthRange(
  value: Date,
  timezone = 'Asia/Jakarta',
): BudgetMonthRange {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError('A valid date is required to resolve a budget month');
  }

  const parts = getZonedParts(value, timezone);
  const nextMonth =
    parts.month === 12
      ? { year: parts.year + 1, month: 1 }
      : { year: parts.year, month: parts.month + 1 };

  return {
    periodStart: new Date(Date.UTC(parts.year, parts.month - 1, 1)),
    periodEndDate: new Date(Date.UTC(parts.year, parts.month, 0)),
    start: zonedDateTimeToUtc(parts.year, parts.month, 1, timezone),
    end: zonedDateTimeToUtc(nextMonth.year, nextMonth.month, 1, timezone),
    localDate: new Date(Date.UTC(parts.year, parts.month - 1, parts.day)),
  };
}

/**
 * Resolves every monthly allocation period touched by a requested date range.
 * A missing boundary uses the other boundary; when both are absent, the
 * current month is returned.
 */
export function getBudgetMonthRanges(
  startDate?: Date,
  endDate?: Date,
  timezone = 'Asia/Jakarta',
  fallbackDate = new Date(),
): BudgetMonthRange[] {
  const firstReference = startDate ?? endDate ?? fallbackDate;
  const lastReference = endDate ?? startDate ?? fallbackDate;
  const firstMonth = getBudgetMonthRange(firstReference, timezone);
  const lastMonth = getBudgetMonthRange(lastReference, timezone);

  if (firstMonth.periodStart > lastMonth.periodStart) {
    throw new RangeError('startDate must be earlier than or equal to endDate');
  }

  const ranges: BudgetMonthRange[] = [];
  let cursor = new Date(firstMonth.periodStart);

  while (cursor <= lastMonth.periodStart) {
    const localMonthStart = getZonedDateBoundary(cursor, timezone);
    ranges.push(getBudgetMonthRange(localMonthStart, timezone));
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }

  return ranges;
}

/** Converts a database @db.Date value to local midnight in the requested timezone. */
export function getZonedDateBoundary(
  dateOnly: Date,
  timezone = 'Asia/Jakarta',
): Date {
  return zonedDateTimeToUtc(
    dateOnly.getUTCFullYear(),
    dateOnly.getUTCMonth() + 1,
    dateOnly.getUTCDate(),
    timezone,
  );
}

/** Returns the instant at local midnight immediately after a database @db.Date. */
export function getZonedNextDateBoundary(
  dateOnly: Date,
  timezone = 'Asia/Jakarta',
): Date {
  const next = new Date(
    Date.UTC(
      dateOnly.getUTCFullYear(),
      dateOnly.getUTCMonth(),
      dateOnly.getUTCDate() + 1,
    ),
  );
  return getZonedDateBoundary(next, timezone);
}

function getZonedParts(
  value: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  if (!year || !month || !day) {
    throw new RangeError(`Unable to resolve date in timezone ${timezone}`);
  }

  return { year, month, day };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  timezone: string,
): Date {
  const targetUtc = Date.UTC(year, month - 1, day);
  let result = targetUtc;

  // Reconcile the requested local wall-clock time with its UTC representation.
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(result));

    const values = Object.fromEntries(
      parts.map((part) => [part.type, Number(part.value)]),
    );

    const representedUtc = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    );

    result += targetUtc - representedUtc;
  }

  return new Date(result);
}
