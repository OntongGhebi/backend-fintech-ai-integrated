import { BudgetScopeType } from '../../../generated/prisma/client.js';
import { PrismaService } from 'src/database/prisma/prisma.service';
import {
  BudgetScopeDescriptor,
  BudgetScopeEngine,
} from './budget-scope.engine';

describe('BudgetScopeEngine', () => {
  let engine: BudgetScopeEngine;

  let prisma: {
    category: {
      findMany: jest.Mock;
    };
  };

  const rootCategoryId = '11111111-1111-4111-8111-111111111111';
  const childCategoryId = '22222222-2222-4222-8222-222222222222';
  const secondChildCategoryId = '33333333-3333-4333-8333-333333333333';
  const customCategoryId = '44444444-4444-4444-8444-444444444444';

  const createBudget = (
    overrides: Partial<BudgetScopeDescriptor> = {},
  ): BudgetScopeDescriptor => ({
    scopeType: BudgetScopeType.ALL_EXPENSES,
    scopeCategoryId: null,
    categoryId: null,
    categoryScopes: [],
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      category: {
        findMany: jest.fn(),
      },
    };

    engine = new BudgetScopeEngine(prisma as unknown as PrismaService);
  });

  describe('resolveCategoryIds', () => {
    it('returns null for ALL_EXPENSES', async () => {
      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.ALL_EXPENSES,
        }),
      );

      expect(result).toBeNull();
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('resolves CATEGORY using scopeCategoryId', async () => {
      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.CATEGORY,
          scopeCategoryId: rootCategoryId,
        }),
      );

      expect(result).toEqual([rootCategoryId]);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('supports the legacy categoryId when resolving CATEGORY', async () => {
      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.CATEGORY,
          categoryId: rootCategoryId,
        }),
      );

      expect(result).toEqual([rootCategoryId]);
    });

    it('returns an empty array when CATEGORY has no category reference', async () => {
      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.CATEGORY,
        }),
      );

      expect(result).toEqual([]);
    });

    it('resolves CATEGORY_GROUP with its root and all children', async () => {
      prisma.category.findMany.mockResolvedValue([
        { id: childCategoryId },
        { id: secondChildCategoryId },
      ]);

      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.CATEGORY_GROUP,
          scopeCategoryId: rootCategoryId,
        }),
      );

      expect(result).toEqual([
        rootCategoryId,
        childCategoryId,
        secondChildCategoryId,
      ]);

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          parentId: rootCategoryId,
        },
        select: {
          id: true,
        },
        orderBy: {
          id: 'asc',
        },
      });
    });

    it('does not query children when CATEGORY_GROUP has no root', async () => {
      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.CATEGORY_GROUP,
          scopeCategoryId: null,
        }),
      );

      expect(result).toEqual([]);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('resolves CUSTOM from stored category scopes', async () => {
      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: [
            { categoryId: customCategoryId },
            { categoryId: childCategoryId },
          ],
        }),
      );

      expect(result).toEqual([childCategoryId, customCategoryId]);
    });

    it('removes duplicate category references from CUSTOM', async () => {
      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: [
            { categoryId: customCategoryId },
            { categoryId: customCategoryId },
            { categoryId: childCategoryId },
          ],
        }),
      );

      expect(result).toEqual([childCategoryId, customCategoryId]);
    });

    it('returns an empty array for CUSTOM without stored categories', async () => {
      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: [],
        }),
      );

      expect(result).toEqual([]);
    });
  });

  describe('buildTransactionWhere', () => {
    it('does not restrict categoryId for ALL_EXPENSES', async () => {
      const baseWhere = {
        userId: 'user-id',
        type: 'EXPENSE',
        status: 'ACTIVE',
      } as const;

      const result = await engine.buildTransactionWhere(
        createBudget({
          scopeType: BudgetScopeType.ALL_EXPENSES,
        }),
        baseWhere,
      );

      expect(result).toEqual(baseWhere);
      expect(result).not.toHaveProperty('categoryId');
    });

    it('adds a category filter for CATEGORY', async () => {
      const result = await engine.buildTransactionWhere(
        createBudget({
          scopeType: BudgetScopeType.CATEGORY,
          scopeCategoryId: rootCategoryId,
        }),
        {
          userId: 'user-id',
          type: 'EXPENSE',
        },
      );

      expect(result).toEqual({
        userId: 'user-id',
        type: 'EXPENSE',
        categoryId: {
          in: [rootCategoryId],
        },
      });
    });

    it('adds root and child IDs for CATEGORY_GROUP', async () => {
      prisma.category.findMany.mockResolvedValue([{ id: childCategoryId }]);

      const result = await engine.buildTransactionWhere(
        createBudget({
          scopeType: BudgetScopeType.CATEGORY_GROUP,
          scopeCategoryId: rootCategoryId,
        }),
        {
          userId: 'user-id',
          type: 'EXPENSE',
        },
      );

      expect(result).toEqual({
        userId: 'user-id',
        type: 'EXPENSE',
        categoryId: {
          in: [rootCategoryId, childCategoryId],
        },
      });
    });

    it('adds stored category IDs for CUSTOM', async () => {
      const result = await engine.buildTransactionWhere(
        createBudget({
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: [{ categoryId: customCategoryId }],
        }),
        {
          userId: 'user-id',
          type: 'EXPENSE',
        },
      );

      expect(result).toEqual({
        userId: 'user-id',
        type: 'EXPENSE',
        categoryId: {
          in: [customCategoryId],
        },
      });
    });

    it('uses an empty category filter when a scope has no resolved categories', async () => {
      const result = await engine.buildTransactionWhere(
        createBudget({
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: [],
        }),
        {
          userId: 'user-id',
          type: 'EXPENSE',
        },
      );

      expect(result).toEqual({
        userId: 'user-id',
        type: 'EXPENSE',
        categoryId: {
          in: [],
        },
      });
    });
  });

  describe('resolveCategoryIdsForBudgets', () => {
    it('returns null when at least one budget uses ALL_EXPENSES', async () => {
      const result = await engine.resolveCategoryIdsForBudgets([
        createBudget({
          scopeType: BudgetScopeType.CATEGORY,
          scopeCategoryId: rootCategoryId,
        }),
        createBudget({
          scopeType: BudgetScopeType.ALL_EXPENSES,
        }),
      ]);

      expect(result).toBeNull();
    });

    it('returns the unique union of category IDs', async () => {
      prisma.category.findMany.mockResolvedValue([{ id: childCategoryId }]);

      const result = await engine.resolveCategoryIdsForBudgets([
        createBudget({
          scopeType: BudgetScopeType.CATEGORY,
          scopeCategoryId: rootCategoryId,
        }),
        createBudget({
          scopeType: BudgetScopeType.CATEGORY_GROUP,
          scopeCategoryId: rootCategoryId,
        }),
        createBudget({
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: [{ categoryId: customCategoryId }],
        }),
      ]);

      expect(result).toEqual([
        rootCategoryId,
        childCategoryId,
        customCategoryId,
      ]);
    });

    it('returns an empty array when no budgets are provided', async () => {
      const result = await engine.resolveCategoryIdsForBudgets([]);

      expect(result).toEqual([]);
    });
  });
});
