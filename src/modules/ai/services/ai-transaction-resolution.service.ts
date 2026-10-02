import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import {
  AITransactionEntities,
  AITransactionType,
} from '../types/ai-transaction.types';
import {
  AIAccountResolution,
  AICategoryResolution,
  AIResolvedAccount,
  AIResolvedCategory,
  AITransactionResolutionResult,
} from '../types/ai-transaction-resolution.types';

interface AccountRecord {
  id: string;
  name: string;
  type: string;
  currency: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  type: string;
}

@Injectable()
export class AITransactionResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    userId: string,
    entities: AITransactionEntities,
  ): Promise<AITransactionResolutionResult> {
    const account = await this.resolveAccount(userId, entities.accountHint);

    const destinationAccount =
      entities.type === 'TRANSFER'
        ? await this.resolveAccount(userId, entities.destinationAccountHint)
        : this.createNotRequestedAccountResolution();

    const category =
      entities.type === 'TRANSFER'
        ? this.createNotRequestedCategoryResolution()
        : await this.resolveCategory(
            userId,
            entities.categoryHint,
            entities.type,
          );

    return {
      account,
      destinationAccount,
      category,
      ready: this.isReady(entities.type, account, destinationAccount, category),
    };
  }

  private async resolveAccount(
    userId: string,
    hint: string | null,
  ): Promise<AIAccountResolution> {
    const normalizedHint = this.normalizeHint(hint);

    if (!normalizedHint) {
      return {
        status: 'NOT_REQUESTED',
        hint: null,
        account: null,
        candidates: [],
      };
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
        currency: 'IDR',
      },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const candidates = this.findBestMatches(accounts, normalizedHint);

    if (candidates.length === 1) {
      return {
        status: 'RESOLVED',
        hint,
        account: this.toResolvedAccount(candidates[0]),
        candidates: [this.toResolvedAccount(candidates[0])],
      };
    }

    if (candidates.length > 1) {
      return {
        status: 'AMBIGUOUS',
        hint,
        account: null,
        candidates: candidates.map((candidate) =>
          this.toResolvedAccount(candidate),
        ),
      };
    }

    return {
      status: 'UNRESOLVED',
      hint,
      account: null,
      candidates: [],
    };
  }

  private async resolveCategory(
    userId: string,
    hint: string | null,
    transactionType: AITransactionType,
  ): Promise<AICategoryResolution> {
    const normalizedHint = this.normalizeHint(hint);

    if (!normalizedHint) {
      return {
        status: 'NOT_REQUESTED',
        hint: null,
        category: null,
        candidates: [],
      };
    }

    const categoryType = transactionType === 'INCOME' ? 'INCOME' : 'EXPENSE';

    const categories = await this.prisma.category.findMany({
      where: {
        userId,
        type: categoryType,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const candidates = this.findBestMatches(
      categories.filter((category) => category.type === categoryType),
      normalizedHint,
    );

    if (candidates.length === 1) {
      return {
        status: 'RESOLVED',
        hint,
        category: this.toResolvedCategory(candidates[0]),
        candidates: [this.toResolvedCategory(candidates[0])],
      };
    }

    if (candidates.length > 1) {
      return {
        status: 'AMBIGUOUS',
        hint,
        category: null,
        candidates: candidates.map((candidate) =>
          this.toResolvedCategory(candidate),
        ),
      };
    }

    return {
      status: 'UNRESOLVED',
      hint,
      category: null,
      candidates: [],
    };
  }

  private findBestMatches<T extends { name: string }>(
    records: T[],
    normalizedHint: string,
  ): T[] {
    return records.filter((record) =>
      this.normalizeHint(record.name).includes(normalizedHint),
    );
  }

  private normalizeHint(value: string | null): string {
    return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  }

  private toResolvedAccount(account: AccountRecord): AIResolvedAccount {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
    };
  }

  private toResolvedCategory(category: CategoryRecord): AIResolvedCategory {
    return {
      id: category.id,
      name: category.name,
      type: category.type,
    };
  }

  private createNotRequestedAccountResolution(): AIAccountResolution {
    return {
      status: 'NOT_REQUESTED',
      hint: null,
      account: null,
      candidates: [],
    };
  }

  private createNotRequestedCategoryResolution(): AICategoryResolution {
    return {
      status: 'NOT_REQUESTED',
      hint: null,
      category: null,
      candidates: [],
    };
  }

  private isReady(
    transactionType: AITransactionType,
    account: AIAccountResolution,
    destinationAccount: AIAccountResolution,
    category: AICategoryResolution,
  ): boolean {
    if (account.status !== 'RESOLVED') {
      return false;
    }

    if (
      transactionType === 'TRANSFER' &&
      destinationAccount.status !== 'RESOLVED'
    ) {
      return false;
    }

    if (
      transactionType !== 'TRANSFER' &&
      (category.status === 'AMBIGUOUS' || category.status === 'UNRESOLVED')
    ) {
      return false;
    }

    return true;
  }
}
