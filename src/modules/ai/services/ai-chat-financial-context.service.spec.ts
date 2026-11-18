import { AIFinancialContextService } from './ai-financial-context.service';
import { AIChatFinancialContextService } from './ai-chat-financial-context.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BudgetScopeEngine } from '../../budgets/budget-scope.engine';

describe('AIChatFinancialContextService', () => {
  let service: AIChatFinancialContextService;

  let prisma: {
    budgetRecommendation: {
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    category: {
      findMany: jest.Mock;
    };
  };

  let budgetScopeEngine: {
    resolveCategoryIds: jest.Mock;
  };

  const userId = 'user-1';

  const financialContext = {
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    period: {
      start: new Date('2026-11-01T00:00:00.000Z'),
      end: new Date('2026-12-01T00:00:00.000Z'),
    },
    summary: {
      income: '5000000.00',
      expense: '1500000.00',
      balance: '3500000.00',
      incomeCount: 2,
      expenseCount: 5,
    },
    expensesByCategory: [],
    recentTransactions: [],
    budgets: [],
  };

  const createRecommendation = (overrides: Record<string, any> = {}) => ({
    id: 'recommendation-1',
    budgetId: 'budget-1',
    targetMonth: new Date('2026-12-01T00:00:00.000Z'),
    currentAllocation: '500000.00',
    proposedAllocation: '600000.00',
    changeAmount: '100000.00',
    changePercentage: '20.00',
    action: 'INCREASE',
    status: 'PENDING',
    reason: 'Pengeluaran kategori meningkat.',
    guardrails: ['WITHIN_MONTHLY_LIMIT'],
    aiExplanation: 'Alokasi perlu disesuaikan.',
    deferredUntil: null,
    rejectionReason: null,
    appliedAt: null,
    evaluatedAt: null,
    evaluationStatus: null,
    evaluation: null,
    createdAt: new Date('2026-11-15T10:00:00.000Z'),
    budget: {
      name: 'Food Budget',
      category: {
        name: 'Food',
      },
      scopeType: 'CATEGORY',
      scopeCategoryId: 'category-food',
      categoryId: 'category-food',
      categoryScopes: [],
    },
    ...overrides,
  });

  const createStatusGroups = () => [
    { status: 'PENDING', _count: { _all: 2 } },
    { status: 'ACCEPTED', _count: { _all: 1 } },
    { status: 'REJECTED', _count: { _all: 1 } },
    { status: 'DEFERRED', _count: { _all: 1 } },
    { status: 'APPLIED', _count: { _all: 2 } },
    { status: 'EVALUATED', _count: { _all: 1 } },
  ];

  beforeEach(() => {
    jest.restoreAllMocks();

    prisma = {
      budgetRecommendation: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    budgetScopeEngine = {
      resolveCategoryIds: jest.fn(),
    };

    jest
      .spyOn(AIFinancialContextService.prototype, 'getContext')
      .mockResolvedValue(financialContext as any);

    service = new AIChatFinancialContextService(
      prisma as unknown as PrismaService,
      budgetScopeEngine as unknown as BudgetScopeEngine,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getContext', () => {
    it('should preserve the base financial context', async () => {
      const result = await service.getContext(userId);

      expect(result).toMatchObject(financialContext);
      expect(result.financialWellBeing).toBeDefined();
    });

    it('should retrieve recommendation status counts for the user', async () => {
      prisma.budgetRecommendation.groupBy.mockResolvedValue(
        createStatusGroups(),
      );

      const result = await service.getContext(userId);

      expect(prisma.budgetRecommendation.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      });

      expect(result.financialWellBeing.recommendationSummary.byStatus).toEqual({
        PENDING: 2,
        ACCEPTED: 1,
        REJECTED: 1,
        DEFERRED: 1,
        APPLIED: 2,
        EVALUATED: 1,
      });

      expect(result.financialWellBeing.recommendationSummary.total).toBe(8);
    });

    it('should retrieve recent recommendations with the configured limit and ordering', async () => {
      await service.getContext(userId);

      expect(prisma.budgetRecommendation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: [{ targetMonth: 'desc' }, { createdAt: 'desc' }],
          take: 20,
        }),
      );
    });

    it('should map recommendation monetary values to strings', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation(),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(['category-food']);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
      ]);

      const result = await service.getContext(userId);
      const recommendation = result.financialWellBeing.recentRecommendations[0];

      expect(recommendation).toMatchObject({
        id: 'recommendation-1',
        budgetId: 'budget-1',
        budgetName: 'Food Budget',
        category: 'Food',
        targetMonth: '2026-12',
        currentAllocation: '500000.00',
        proposedAllocation: '600000.00',
        changeAmount: '100000.00',
        changePercentage: '20.00',
        action: 'INCREASE',
        status: 'PENDING',
      });
    });

    it('should map recommendation lifecycle timestamps to ISO strings', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation({
          status: 'APPLIED',
          appliedAt: new Date('2026-11-16T10:00:00.000Z'),
          evaluatedAt: new Date('2026-11-17T10:00:00.000Z'),
          deferredUntil: new Date('2026-12-01T00:00:00.000Z'),
        }),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(['category-food']);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
      ]);

      const result = await service.getContext(userId);
      const recommendation = result.financialWellBeing.recentRecommendations[0];

      expect(recommendation.appliedAt).toBe('2026-11-16T10:00:00.000Z');
      expect(recommendation.evaluatedAt).toBe('2026-11-17T10:00:00.000Z');
      expect(recommendation.deferredUntil).toBe('2026-12-01T00:00:00.000Z');
    });

    it('should preserve evaluation data and guardrails', async () => {
      const evaluation = {
        actualExpense: '550000.00',
        variance: '-50000.00',
        result: 'WITHIN_ALLOCATION',
      };

      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation({
          status: 'EVALUATED',
          evaluationStatus: 'SUCCESS',
          evaluation,
          guardrails: ['WITHIN_MONTHLY_LIMIT', 'SUFFICIENT_HISTORY'],
        }),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(['category-food']);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
      ]);

      const result = await service.getContext(userId);
      const recommendation = result.financialWellBeing.recentRecommendations[0];

      expect(recommendation.evaluation).toEqual(evaluation);
      expect(recommendation.evaluationStatus).toBe('SUCCESS');
      expect(recommendation.guardrails).toEqual([
        'WITHIN_MONTHLY_LIMIT',
        'SUFFICIENT_HISTORY',
      ]);
    });

    it('should include only actionable statuses in the action center', async () => {
      const statuses = [
        'PENDING',
        'ACCEPTED',
        'DEFERRED',
        'REJECTED',
        'APPLIED',
        'EVALUATED',
      ];

      prisma.budgetRecommendation.findMany.mockResolvedValue(
        statuses.map((status, index) =>
          createRecommendation({
            id: `recommendation-${index}`,
            status,
          }),
        ),
      );

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(['category-food']);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
      ]);

      const result = await service.getContext(userId);

      expect(
        result.financialWellBeing.actionCenter.map((item) => item.status),
      ).toEqual(['PENDING', 'ACCEPTED', 'DEFERRED']);
    });

    it('should limit the action center to ten recommendations', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue(
        Array.from({ length: 20 }, (_, index) =>
          createRecommendation({
            id: `recommendation-${index}`,
            status: 'PENDING',
          }),
        ),
      );

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(['category-food']);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
      ]);

      const result = await service.getContext(userId);

      expect(result.financialWellBeing.actionCenter).toHaveLength(10);
      expect(result.financialWellBeing.recentRecommendations).toHaveLength(20);
    });

    it('should calculate recommendation summary truncation correctly', async () => {
      prisma.budgetRecommendation.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 25 } },
      ]);

      prisma.budgetRecommendation.findMany.mockResolvedValue(
        Array.from({ length: 20 }, (_, index) =>
          createRecommendation({
            id: `recommendation-${index}`,
          }),
        ),
      );

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(['category-food']);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
      ]);

      const result = await service.getContext(userId);

      expect(result.financialWellBeing.recommendationSummary).toMatchObject({
        total: 25,
        returnedRecommendationCount: 20,
        isTruncated: true,
      });
    });
  });

  describe('budget scope integration', () => {
    it('should resolve CATEGORY scope and include its category name', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation({
          budget: {
            name: 'Food Budget',
            category: { name: 'Food' },
            scopeType: 'CATEGORY',
            scopeCategoryId: 'category-food',
            categoryId: 'category-food',
            categoryScopes: [],
          },
        }),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(['category-food']);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
      ]);

      const result = await service.getContext(userId);
      const recommendation = result.financialWellBeing.recentRecommendations[0];

      expect(budgetScopeEngine.resolveCategoryIds).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'CATEGORY',
          scopeCategoryId: 'category-food',
          categoryId: 'category-food',
          categoryScopes: [],
        }),
      );

      expect(recommendation.budgetScope).toEqual({
        type: 'CATEGORY',
        categoryNames: ['Food'],
        includesUncategorized: false,
      });
    });

    it('should resolve recursive CATEGORY_GROUP scope including descendants', async () => {
      const categoryIds = [
        'category-food',
        'category-groceries',
        'category-snacks',
        'category-drinks',
      ];

      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation({
          budget: {
            name: 'Food Group Budget',
            category: { name: 'Food' },
            scopeType: 'CATEGORY_GROUP',
            scopeCategoryId: 'category-food',
            categoryId: null,
            categoryScopes: [],
          },
        }),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(categoryIds);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
        { id: 'category-groceries', name: 'Groceries' },
        { id: 'category-snacks', name: 'Snacks' },
        { id: 'category-drinks', name: 'Drinks' },
      ]);

      const result = await service.getContext(userId);
      const recommendation = result.financialWellBeing.recentRecommendations[0];

      expect(budgetScopeEngine.resolveCategoryIds).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'CATEGORY_GROUP',
          scopeCategoryId: 'category-food',
        }),
      );

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: categoryIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      expect(recommendation.budgetScope).toEqual({
        type: 'CATEGORY_GROUP',
        categoryNames: ['Food', 'Groceries', 'Snacks', 'Drinks'],
        includesUncategorized: false,
      });
    });

    it('should resolve CUSTOM scope using configured category references', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation({
          budget: {
            name: 'Custom Budget',
            category: null,
            scopeType: 'CUSTOM',
            scopeCategoryId: null,
            categoryId: null,
            categoryScopes: [
              { categoryId: 'category-food' },
              { categoryId: 'category-transport' },
            ],
          },
        }),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue([
        'category-food',
        'category-transport',
      ]);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
        { id: 'category-transport', name: 'Transport' },
      ]);

      const result = await service.getContext(userId);
      const recommendation = result.financialWellBeing.recentRecommendations[0];

      expect(recommendation.budgetScope).toEqual({
        type: 'CUSTOM',
        categoryNames: ['Food', 'Transport'],
        includesUncategorized: false,
      });
    });

    it('should mark ALL_EXPENSES as including uncategorized transactions', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation({
          budget: {
            name: 'All Expenses Budget',
            category: null,
            scopeType: 'ALL_EXPENSES',
            scopeCategoryId: null,
            categoryId: null,
            categoryScopes: [],
          },
        }),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(null);

      const result = await service.getContext(userId);
      const recommendation = result.financialWellBeing.recentRecommendations[0];

      expect(recommendation.budgetScope).toEqual({
        type: 'ALL_EXPENSES',
        categoryNames: [],
        includesUncategorized: true,
      });

      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('should handle an empty resolved scope without including uncategorized transactions', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation({
          budget: {
            name: 'Empty Scope Budget',
            category: null,
            scopeType: 'CUSTOM',
            scopeCategoryId: null,
            categoryId: null,
            categoryScopes: [],
          },
        }),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue([]);

      const result = await service.getContext(userId);
      const recommendation = result.financialWellBeing.recentRecommendations[0];

      expect(recommendation.budgetScope).toEqual({
        type: 'CUSTOM',
        categoryNames: [],
        includesUncategorized: false,
      });

      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('should fetch category names only once for unique resolved category IDs', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation({
          id: 'recommendation-1',
          budget: {
            name: 'Food Budget',
            category: null,
            scopeType: 'CATEGORY_GROUP',
            scopeCategoryId: 'category-food',
            categoryId: null,
            categoryScopes: [],
          },
        }),
        createRecommendation({
          id: 'recommendation-2',
          budget: {
            name: 'Custom Budget',
            category: null,
            scopeType: 'CUSTOM',
            scopeCategoryId: null,
            categoryId: null,
            categoryScopes: [
              { categoryId: 'category-food' },
              { categoryId: 'category-transport' },
            ],
          },
        }),
      ]);

      budgetScopeEngine.resolveCategoryIds
        .mockResolvedValueOnce(['category-food', 'category-groceries'])
        .mockResolvedValueOnce(['category-food', 'category-transport']);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
        { id: 'category-groceries', name: 'Groceries' },
        { id: 'category-transport', name: 'Transport' },
      ]);

      await service.getContext(userId);

      expect(prisma.category.findMany).toHaveBeenCalledTimes(1);

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['category-food', 'category-groceries', 'category-transport'],
          },
        },
        select: {
          id: true,
          name: true,
        },
      });
    });

    it('should resolve each recommendation scope independently', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation({
          id: 'recommendation-category',
          budget: {
            name: 'Food Budget',
            category: { name: 'Food' },
            scopeType: 'CATEGORY',
            scopeCategoryId: 'category-food',
            categoryId: 'category-food',
            categoryScopes: [],
          },
        }),
        createRecommendation({
          id: 'recommendation-all',
          budget: {
            name: 'All Expenses Budget',
            category: null,
            scopeType: 'ALL_EXPENSES',
            scopeCategoryId: null,
            categoryId: null,
            categoryScopes: [],
          },
        }),
      ]);

      budgetScopeEngine.resolveCategoryIds
        .mockResolvedValueOnce(['category-food'])
        .mockResolvedValueOnce(null);

      prisma.category.findMany.mockResolvedValue([
        { id: 'category-food', name: 'Food' },
      ]);

      const result = await service.getContext(userId);

      const recommendations = result.financialWellBeing.recentRecommendations;

      expect(recommendations[0].budgetScope).toEqual({
        type: 'CATEGORY',
        categoryNames: ['Food'],
        includesUncategorized: false,
      });

      expect(recommendations[1].budgetScope).toEqual({
        type: 'ALL_EXPENSES',
        categoryNames: [],
        includesUncategorized: true,
      });
    });

    it('should preserve recommendation records when category names are unavailable', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation(),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockResolvedValue(['category-food']);

      prisma.category.findMany.mockResolvedValue([]);

      const result = await service.getContext(userId);

      expect(result.financialWellBeing.recentRecommendations[0]).toMatchObject({
        id: 'recommendation-1',
        budgetName: 'Food Budget',
        budgetScope: {
          type: 'CATEGORY',
          categoryNames: [],
          includesUncategorized: false,
        },
      });
    });
  });

  describe('empty data and error handling', () => {
    it('should return zero counts when no recommendations exist', async () => {
      const result = await service.getContext(userId);

      expect(result.financialWellBeing.recommendationSummary).toMatchObject({
        total: 0,
        returnedRecommendationCount: 0,
        isTruncated: false,
        byStatus: {
          PENDING: 0,
          ACCEPTED: 0,
          REJECTED: 0,
          DEFERRED: 0,
          APPLIED: 0,
          EVALUATED: 0,
        },
      });

      expect(result.financialWellBeing.actionCenter).toEqual([]);
      expect(result.financialWellBeing.recentRecommendations).toEqual([]);
    });

    it('should propagate recommendation query errors', async () => {
      prisma.budgetRecommendation.findMany.mockRejectedValue(
        new Error('Recommendation query failed'),
      );

      await expect(service.getContext(userId)).rejects.toThrow(
        'Recommendation query failed',
      );
    });

    it('should propagate budget scope resolution errors', async () => {
      prisma.budgetRecommendation.findMany.mockResolvedValue([
        createRecommendation(),
      ]);

      budgetScopeEngine.resolveCategoryIds.mockRejectedValue(
        new Error('Budget scope resolution failed'),
      );

      await expect(service.getContext(userId)).rejects.toThrow(
        'Budget scope resolution failed',
      );
    });
  });
});
