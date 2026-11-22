import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from 'src/database/prisma/prisma.service';

export interface SerializableTransactionOptions {
  /**
   * Number of retries after the initial transaction attempt.
   */
  maxRetries?: number;

  /**
   * Initial retry delay. Each subsequent retry uses exponential backoff.
   */
  baseDelayMs?: number;
}

function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2034'
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runSerializableTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: SerializableTransactionOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 25;

  let retryCount = 0;

  while (true) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!isSerializationConflict(error) || retryCount >= maxRetries) {
        throw error;
      }

      retryCount += 1;

      if (baseDelayMs > 0) {
        await wait(baseDelayMs * 2 ** (retryCount - 1));
      }
    }
  }
}
