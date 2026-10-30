import { Prisma } from '../../../generated/prisma/client.js';

export type AccountBalanceTransaction = {
  type: string;
  amount: Prisma.Decimal | string | number;
  metadata: Prisma.JsonValue | null;
};

export function calculateAccountBalance(
  openingBalance: Prisma.Decimal | string | number,
  transactions: AccountBalanceTransaction[],
): Prisma.Decimal {
  let balance = new Prisma.Decimal(openingBalance.toString());

  for (const transaction of transactions) {
    const amount = new Prisma.Decimal(transaction.amount.toString());

    if (transaction.type === 'INCOME') {
      balance = balance.plus(amount);
      continue;
    }

    if (transaction.type === 'EXPENSE') {
      balance = balance.minus(amount);
      continue;
    }

    if (transaction.type === 'TRANSFER') {
      const metadata = transaction.metadata;
      const direction =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
          ? metadata.direction
          : undefined;

      if (direction === 'IN') {
        balance = balance.plus(amount);
      } else if (direction === 'OUT') {
        balance = balance.minus(amount);
      }
    }
  }

  return balance;
}
