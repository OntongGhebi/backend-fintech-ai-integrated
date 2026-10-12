import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must be configured before seeding the database.',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main(): Promise<void> {
  const plan = await prisma.plan.upsert({
    where: { code: 'PREMIUM_MONTHLY' },
    create: {
      code: 'PREMIUM_MONTHLY',
      name: 'Premium Monthly',
      description: 'Monthly Premium subscription plan for checkout testing.',
      price: '99000',
      currency: 'IDR',
      billingInterval: 'MONTHLY',
      isActive: true,
    },
    update: {
      isActive: true,
    },
    select: {
      code: true,
      price: true,
      currency: true,
    },
  });

  console.info(
    `Seeded active plan ${plan.code}: ${plan.currency} ${plan.price.toString()}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Unable to seed the subscription plan.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
