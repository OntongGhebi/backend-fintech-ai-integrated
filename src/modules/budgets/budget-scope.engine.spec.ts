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
  const grandchildCategoryId = '55555555-5555-4555-8555-555555555555';
  const secondGrandchildCategoryId = '66666666-6666-4666-8666-666666666666';
  const thirdLevelCategoryId = '77777777-7777-4777-8777-777777777777';

  const createBudget = (
    overrides: Partial<BudgetScopeDescriptor> = {},
  ): BudgetScopeDescriptor => ({
    scopeType: BudgetScopeType.ALL_EXPENSES,
    scopeCategoryId: null,
    categoryId: null,
    categoryScopes: [],
    ...overrides,
  });

  const mockCategoryLevels = (...levels: Array<Array<{ id: string }>>) => {
    for (const level of levels) {
      prisma.category.findMany.mockResolvedValueOnce(level);
    }
  };

  const expectedGroupCategoryIds = () =>
    [
      rootCategoryId,
      childCategoryId,
      secondChildCategoryId,
      grandchildCategoryId,
      secondGrandchildCategoryId,
      thirdLevelCategoryId,
    ].sort((a, b) => {
      if (a === rootCategoryId) return -1;
      if (b === rootCategoryId) return 1;
      return a.localeCompare(b);
    });

  beforeEach(() => {
    prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([]),
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
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty array when CATEGORY has no category reference', async () => {
      const result = await engine.resolveCategoryIds(
        createBudget({
          scopeType: BudgetScopeType.CATEGORY,
        }),
      );

      expect(result).toEqual([]);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    describe('CATEGORY_GROUP', () => {
      it('resolves the root and its direct children', async () => {
        prisma.category.findMany.mockResolvedValueOnce([
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

        expect(prisma.category.findMany).toHaveBeenCalledTimes(2);

        expect(prisma.category.findMany).toHaveBeenNthCalledWith(1, {
          where: {
            parentId: {
              in: [rootCategoryId],
            },
          },
          select: {
            id: true,
          },
          orderBy: {
            id: 'asc',
          },
        });

        expect(prisma.category.findMany).toHaveBeenNthCalledWith(2, {
          where: {
            parentId: {
              in: [childCategoryId, secondChildCategoryId],
            },
          },
          select: {
            id: true,
          },
          orderBy: {
            id: 'asc',
          },
        });
      });

      it('resolves descendants across three hierarchy levels', async () => {
        mockCategoryLevels(
          [{ id: childCategoryId }, { id: secondChildCategoryId }],
          [{ id: grandchildCategoryId }],
          [{ id: thirdLevelCategoryId }],
          [],
        );

        const result = await engine.resolveCategoryIds(
          createBudget({
            scopeType: BudgetScopeType.CATEGORY_GROUP,
            scopeCategoryId: rootCategoryId,
          }),
        );

        expect(result).toEqual(
          [
            rootCategoryId,
            childCategoryId,
            secondChildCategoryId,
            grandchildCategoryId,
            thirdLevelCategoryId,
          ].sort((a, b) => {
            if (a === rootCategoryId) return -1;
            if (b === rootCategoryId) return 1;
            return a.localeCompare(b);
          }),
        );

        expect(prisma.category.findMany).toHaveBeenCalledTimes(4);
      });

      it('resolves multiple branches and their descendants', async () => {
        mockCategoryLevels(
          [{ id: childCategoryId }, { id: secondChildCategoryId }],
          [{ id: grandchildCategoryId }, { id: secondGrandchildCategoryId }],
          [{ id: thirdLevelCategoryId }],
          [],
        );

        const result = await engine.resolveCategoryIds(
          createBudget({
            scopeType: BudgetScopeType.CATEGORY_GROUP,
            scopeCategoryId: rootCategoryId,
          }),
        );

        expect(result).toEqual(
          [
            rootCategoryId,
            childCategoryId,
            secondChildCategoryId,
            grandchildCategoryId,
            secondGrandchildCategoryId,
            thirdLevelCategoryId,
          ].sort((a, b) => {
            if (a === rootCategoryId) return -1;
            if (b === rootCategoryId) return 1;
            return a.localeCompare(b);
          }),
        );

        expect(prisma.category.findMany).toHaveBeenCalledTimes(4);

        expect(prisma.category.findMany).toHaveBeenNthCalledWith(3, {
          where: {
            parentId: {
              in: [grandchildCategoryId, secondGrandchildCategoryId],
            },
          },
          select: {
            id: true,
          },
          orderBy: {
            id: 'asc',
          },
        });
      });

      it('returns only the root when it has no descendants', async () => {
        prisma.category.findMany.mockResolvedValueOnce([]);

        const result = await engine.resolveCategoryIds(
          createBudget({
            scopeType: BudgetScopeType.CATEGORY_GROUP,
            scopeCategoryId: rootCategoryId,
          }),
        );

        expect(result).toEqual([rootCategoryId]);
        expect(prisma.category.findMany).toHaveBeenCalledTimes(1);
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

      it('does not duplicate category IDs returned at different levels', async () => {
        mockCategoryLevels(
          [{ id: childCategoryId }, { id: secondChildCategoryId }],
          [{ id: grandchildCategoryId }, { id: childCategoryId }],
          [],
        );

        const result = await engine.resolveCategoryIds(
          createBudget({
            scopeType: BudgetScopeType.CATEGORY_GROUP,
            scopeCategoryId: rootCategoryId,
          }),
        );

        expect(result).toEqual(
          [
            rootCategoryId,
            childCategoryId,
            secondChildCategoryId,
            grandchildCategoryId,
          ].sort((a, b) => {
            if (a === rootCategoryId) return -1;
            if (b === rootCategoryId) return 1;
            return a.localeCompare(b);
          }),
        );

        expect(new Set(result).size).toBe(result.length);
      });

      it('does not revisit the root when a cyclic reference is encountered', async () => {
        mockCategoryLevels(
          [{ id: childCategoryId }],
          [{ id: rootCategoryId }, { id: grandchildCategoryId }],
          [],
        );

        const result = await engine.resolveCategoryIds(
          createBudget({
            scopeType: BudgetScopeType.CATEGORY_GROUP,
            scopeCategoryId: rootCategoryId,
          }),
        );

        expect(result).toEqual(
          [rootCategoryId, childCategoryId, grandchildCategoryId].sort(
            (a, b) => {
              if (a === rootCategoryId) return -1;
              if (b === rootCategoryId) return 1;
              return a.localeCompare(b);
            },
          ),
        );

        expect(prisma.category.findMany).toHaveBeenCalledTimes(3);
        expect(new Set(result).size).toBe(result.length);
      });

      it('includes archived descendants because historical scopes must remain stable', async () => {
        prisma.category.findMany.mockResolvedValueOnce([
          { id: childCategoryId },
        ]);

        const result = await engine.resolveCategoryIds(
          createBudget({
            scopeType: BudgetScopeType.CATEGORY_GROUP,
            scopeCategoryId: rootCategoryId,
          }),
        );

        expect(result).toContain(childCategoryId);

        expect(prisma.category.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              parentId: {
                in: [rootCategoryId],
              },
            },
          }),
        );
      });
    });

    describe('CUSTOM', () => {
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

        expect(prisma.category.findMany).not.toHaveBeenCalled();
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
      expect(prisma.category.findMany).not.toHaveBeenCalled();
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

    it('adds all descendant IDs for CATEGORY_GROUP', async () => {
      mockCategoryLevels(
        [{ id: childCategoryId }],
        [{ id: grandchildCategoryId }],
        [],
      );

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
          in: [rootCategoryId, childCategoryId, grandchildCategoryId].sort(
            (a, b) => {
              if (a === rootCategoryId) return -1;
              if (b === rootCategoryId) return 1;
              return a.localeCompare(b);
            },
          ),
        },
      });

      expect(prisma.category.findMany).toHaveBeenCalledTimes(3);
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

    it('preserves other transaction filters when adding a category scope', async () => {
      const baseWhere = {
        userId: 'user-id',
        type: 'EXPENSE',
        status: 'ACTIVE',
        currency: 'IDR',
        deletedAt: null,
      };

      const result = await engine.buildTransactionWhere(
        createBudget({
          scopeType: BudgetScopeType.CATEGORY,
          scopeCategoryId: rootCategoryId,
        }),
        baseWhere,
      );

      expect(result).toEqual({
        ...baseWhere,
        categoryId: {
          in: [rootCategoryId],
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
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('returns the unique union of category IDs across recursive scopes', async () => {
      mockCategoryLevels(
        [{ id: childCategoryId }],
        [{ id: grandchildCategoryId }],
        [],
      );

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
          categoryScopes: [
            { categoryId: customCategoryId },
            { categoryId: childCategoryId },
          ],
        }),
      ]);

      expect(result).toEqual(
        [
          rootCategoryId,
          childCategoryId,
          grandchildCategoryId,
          customCategoryId,
        ].sort(),
      );

      expect(new Set(result).size).toBe(result.length);
    });

    it('returns an empty array when no budgets are provided', async () => {
      const result = await engine.resolveCategoryIdsForBudgets([]);

      expect(result).toEqual([]);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('returns a sorted unique union when scopes overlap', async () => {
      mockCategoryLevels([{ id: childCategoryId }], []);

      const result = await engine.resolveCategoryIdsForBudgets([
        createBudget({
          scopeType: BudgetScopeType.CATEGORY_GROUP,
          scopeCategoryId: rootCategoryId,
        }),
        createBudget({
          scopeType: BudgetScopeType.CATEGORY,
          scopeCategoryId: childCategoryId,
        }),
        createBudget({
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: [
            { categoryId: rootCategoryId },
            { categoryId: childCategoryId },
          ],
        }),
      ]);

      expect(result).toEqual([rootCategoryId, childCategoryId].sort());

      expect(new Set(result).size).toBe(result.length);
    });
  });
});
