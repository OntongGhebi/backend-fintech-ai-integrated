import { randomUUID } from 'node:crypto';

import { PrismaService } from '../src/database/prisma/prisma.service';
import { TelegramTransactionConfirmationStatus } from '../generated/prisma/enums';

jest.setTimeout(30000);

describe('Telegram Transaction Confirmation — PostgreSQL Integration', () => {
  let prisma: PrismaService;
  let userId: string;
  let telegramAccountId: string;

  const suffix = randomUUID();
  const chatId = `integration-chat-${suffix}`;
  const telegramUserId = BigInt(
    Date.now() + Math.floor(Math.random() * 100000),
  );

  const intent = {
    intent: 'CREATE_TRANSACTION',
    transactionType: 'EXPENSE',
    amount: 25000,
    description: 'Integration test transaction',
    source: 'DETERMINISTIC',
    confidence: 1,
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must point to a dedicated test database.');
    }

    prisma = new PrismaService();
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        email: `telegram-confirmation-${suffix}@example.com`,
        passwordHash: 'integration-test-hash',
        name: 'Telegram Confirmation Integration Test',
      },
    });

    userId = user.id;

    const telegramAccount = await prisma.telegramAccount.create({
      data: {
        userId,
        telegramUserId,
        isVerified: true,
      },
    });

    telegramAccountId = telegramAccount.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (userId) {
        await prisma.telegramTransactionConfirmation.deleteMany({
          where: { userId },
        });

        await prisma.telegramAccount.deleteMany({
          where: { userId },
        });

        await prisma.user.deleteMany({
          where: { id: userId },
        });
      }

      await prisma.$disconnect();
    }
  });

  async function createConfirmation(
    sourceMessageId: string,
    overrides: {
      status?: TelegramTransactionConfirmationStatus;
      expiresAt?: Date;
    } = {},
    targetChatId = chatId,
  ) {
    return prisma.telegramTransactionConfirmation.create({
      data: {
        userId,
        telegramAccountId,
        chatId: targetChatId,
        sourceMessageId,
        telegramUserId,
        intent,
        status:
          overrides.status ?? TelegramTransactionConfirmationStatus.PENDING,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  }

  it('persists a new confirmation with PENDING status', async () => {
    const confirmation = await createConfirmation(`message-create-${suffix}`);

    const persisted = await prisma.telegramTransactionConfirmation.findUnique({
      where: { id: confirmation.id },
    });

    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe(
      TelegramTransactionConfirmationStatus.PENDING,
    );
    expect(persisted?.userId).toBe(userId);
    expect(persisted?.telegramAccountId).toBe(telegramAccountId);
  });

  it('enforces uniqueness for the same chat and source message', async () => {
    const sourceMessageId = `message-duplicate-${suffix}`;

    const results = await Promise.allSettled([
      createConfirmation(sourceMessageId),
      createConfirmation(sourceMessageId),
    ]);

    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const persisted = await prisma.telegramTransactionConfirmation.findMany({
      where: { chatId, sourceMessageId },
    });

    expect(persisted).toHaveLength(1);
  });

  it('allows only one concurrent conditional state transition', async () => {
    const confirmation = await createConfirmation(`message-race-${suffix}`);

    const [confirmResult, cancelResult] = await Promise.all([
      prisma.telegramTransactionConfirmation.updateMany({
        where: {
          id: confirmation.id,
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        data: {
          status: TelegramTransactionConfirmationStatus.CONFIRMED,
        },
      }),
      prisma.telegramTransactionConfirmation.updateMany({
        where: {
          id: confirmation.id,
          status: TelegramTransactionConfirmationStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        data: {
          status: TelegramTransactionConfirmationStatus.CANCELLED,
        },
      }),
    ]);

    expect(confirmResult.count + cancelResult.count).toBe(1);

    const persisted = await prisma.telegramTransactionConfirmation.findUnique({
      where: { id: confirmation.id },
    });

    expect([
      TelegramTransactionConfirmationStatus.CONFIRMED,
      TelegramTransactionConfirmationStatus.CANCELLED,
    ]).toContain(persisted?.status);
  });

  it('does not transition an expired confirmation through a valid pending-state condition', async () => {
    const confirmation = await createConfirmation(`message-expired-${suffix}`, {
      expiresAt: new Date(Date.now() - 60_000),
    });

    const transition = await prisma.telegramTransactionConfirmation.updateMany({
      where: {
        id: confirmation.id,
        status: TelegramTransactionConfirmationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      data: {
        status: TelegramTransactionConfirmationStatus.CONFIRMED,
      },
    });

    expect(transition.count).toBe(0);

    const persisted = await prisma.telegramTransactionConfirmation.findUnique({
      where: { id: confirmation.id },
    });

    expect(persisted?.status).toBe(
      TelegramTransactionConfirmationStatus.PENDING,
    );
  });

  it('expires only pending confirmations whose expiration time has passed', async () => {
    const expirationChatId = `integration-expiration-chat-${suffix}`;
    const expired = await createConfirmation(
      `message-expire-${suffix}`,
      {
        expiresAt: new Date(Date.now() - 60_000),
      },
      expirationChatId,
    );

    const stillValid = await createConfirmation(
      `message-valid-${suffix}`,
      {
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      expirationChatId,
    );

    const result = await prisma.telegramTransactionConfirmation.updateMany({
      where: {
        chatId: expirationChatId,
        status: TelegramTransactionConfirmationStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: {
        status: TelegramTransactionConfirmationStatus.EXPIRED,
      },
    });

    expect(result.count).toBe(1);

    const [expiredAfterUpdate, validAfterUpdate] = await Promise.all([
      prisma.telegramTransactionConfirmation.findUnique({
        where: { id: expired.id },
      }),
      prisma.telegramTransactionConfirmation.findUnique({
        where: { id: stillValid.id },
      }),
    ]);

    expect(expiredAfterUpdate?.status).toBe(
      TelegramTransactionConfirmationStatus.EXPIRED,
    );
    expect(validAfterUpdate?.status).toBe(
      TelegramTransactionConfirmationStatus.PENDING,
    );
  });
});
