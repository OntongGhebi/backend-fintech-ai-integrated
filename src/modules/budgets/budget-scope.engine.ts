import { Injectable } from '@nestjs/common';
import { BudgetScopeType, Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from 'src/database/prisma/prisma.service';

export interface BudgetScopeDescriptor {
  scopeType: BudgetScopeType;
  scopeCategoryId: string | null;
  categoryId?: string | null;
  categoryScopes: Array<{
    categoryId: string;
  }>;
}

@Injectable()
export class BudgetScopeEngine {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a budget scope into category IDs.
   *
   * Return value:
   * - null: all expense transactions, including uncategorized transactions.
   * - []: no category can be matched.
   * - string[]: transactions must belong to one of these categories.
   *
   * Historical continuity:
   * - CATEGORY_GROUP includes all descendants, including archived categories.
   * - CUSTOM uses stored scope references without checking category status.
   */
  async resolveCategoryIds(
    budget: BudgetScopeDescriptor,
  ): Promise<string[] | null> {
    switch (budget.scopeType) {
      case BudgetScopeType.ALL_EXPENSES:
        return null;

      case BudgetScopeType.CATEGORY: {
        const categoryId = budget.scopeCategoryId ?? budget.categoryId ?? null;

        return categoryId ? [categoryId] : [];
      }

      case BudgetScopeType.CATEGORY_GROUP: {
        const rootCategoryId = budget.scopeCategoryId;

        if (!rootCategoryId) {
          return [];
        }

        return this.resolveDescendantCategoryIds(rootCategoryId);
      }

      case BudgetScopeType.CUSTOM: {
        const categoryIds = budget.categoryScopes.map(
          (scope) => scope.categoryId,
        );

        return [...new Set(categoryIds)].sort();
      }

      default: {
        const exhaustiveCheck: never = budget.scopeType;

        throw new Error(
          `Unsupported budget scope type: ${String(exhaustiveCheck)}`,
        );
      }
    }
  }

  /**
   * Resolves a category root and every descendant in its hierarchy.
   *
   * Uses breadth-first traversal:
   * 1. Start with the root category.
   * 2. Find children belonging to the current level.
   * 3. Continue with those children as the next level.
   * 4. Stop when no additional descendants are found.
   *
   * A visited set prevents duplicate IDs and protects against cyclic
   * references if inconsistent hierarchy data is encountered.
   *
   * Archived categories are intentionally included to preserve historical
   * budget scope behavior.
   */
  private async resolveDescendantCategoryIds(
    rootCategoryId: string,
  ): Promise<string[]> {
    const visited = new Set<string>([rootCategoryId]);

    let currentLevel = [rootCategoryId];

    while (currentLevel.length > 0) {
      const children = await this.prisma.category.findMany({
        where: {
          parentId: {
            in: currentLevel,
          },
        },
        select: {
          id: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

      const nextLevel: string[] = [];

      for (const child of children) {
        if (visited.has(child.id)) {
          continue;
        }

        visited.add(child.id);
        nextLevel.push(child.id);
      }

      currentLevel = nextLevel;
    }

    return [
      rootCategoryId,
      ...Array.from(visited)
        .filter((categoryId) => categoryId !== rootCategoryId)
        .sort(),
    ];
  }

  /**
   * Builds a transaction filter for a resolved budget scope.
   *
   * ALL_EXPENSES deliberately does not add a categoryId condition, so
   * transactions with categoryId = null remain included.
   */
  async buildTransactionWhere(
    budget: BudgetScopeDescriptor,
    baseWhere: Prisma.TransactionWhereInput = {},
  ): Promise<Prisma.TransactionWhereInput> {
    const categoryIds = await this.resolveCategoryIds(budget);

    if (categoryIds === null) {
      return {
        ...baseWhere,
      };
    }

    return {
      ...baseWhere,
      categoryId: {
        in: categoryIds,
      },
    };
  }

  /**
   * Resolves multiple budgets without changing their individual scopes.
   *
   * If any budget uses ALL_EXPENSES, the union represents all categories
   * and must not be restricted by categoryId.
   */
  async resolveCategoryIdsForBudgets(
    budgets: BudgetScopeDescriptor[],
  ): Promise<string[] | null> {
    const resolvedScopes = await Promise.all(
      budgets.map((budget) => this.resolveCategoryIds(budget)),
    );

    if (resolvedScopes.some((scope) => scope === null)) {
      return null;
    }

    return [...new Set(resolvedScopes.flatMap((scope) => scope ?? []))].sort();
  }
}
