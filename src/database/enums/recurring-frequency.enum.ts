export const RecurringFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
} as const;

export type RecurringFrequency =
  (typeof RecurringFrequency)[keyof typeof RecurringFrequency];
