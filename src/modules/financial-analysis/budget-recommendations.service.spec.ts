import { BudgetScopeType, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

import { AIService } from '../ai/services/ai.service';
import { BudgetScopeEngine } from '../budgets/budget-scope.engine';

import { BudgetRecommendationsService } from './budget-recommendations.service';

describe('BudgetRecommendationsService', () => {
  let service: BudgetRecommendationsService;

  const prismaMock = {
    userPreference: {
      findUnique: jest.fn(),
    },
    budget: {
      findMany: jest.fn(),
    },
    transaction: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const aiServiceMock = {
    complete: jest.fn(),
  };

  const budgetScopeEngineMock = {
    resolveCategoryIds: jest.fn(
      async (budget: {
        scopeType: BudgetScopeType;
        scopeCategoryId: string | null;
        categoryId?: string | null;
        categoryScopes: Array<{ categoryId: string }>;
      }): Promise<string[] | null> => {
        switch (budget.scopeType) {
          case BudgetScopeType.ALL_EXPENSES:
            return null;

          case BudgetScopeType.CATEGORY: {
            const categoryId =
              budget.scopeCategoryId ?? budget.categoryId ?? null;

            return categoryId ? [categoryId] : [];
          }

          case BudgetScopeType.CATEGORY_GROUP:
            return budget.scopeCategoryId
              ? [budget.scopeCategoryId, 'child-category-food']
              : [];

          case BudgetScopeType.CUSTOM:
            return [
              ...new Set(
                budget.categoryScopes.map((scope) => scope.categoryId),
              ),
            ].sort();

          default:
            return [];
        }
      },
    ),
  };

  const createBudget = (overrides: Record<string, unknown> = {}) => {
    const categoryId =
      overrides.categoryId === undefined
        ? 'category-food'
        : (overrides.categoryId as string | null);

    const category =
      overrides.category === undefined
        ? categoryId
          ? {
              id: categoryId,
              name: 'Food',
              type: 'EXPENSE',
              isActive: true,
              deletedAt: null,
            }
          : null
        : overrides.category;

    const scopeCategory =
      overrides.scopeCategory === undefined
        ? category
        : overrides.scopeCategory;

    const scopeType =
      (overrides.scopeType as BudgetScopeType | undefined) ??
      (categoryId ? BudgetScopeType.CATEGORY : BudgetScopeType.ALL_EXPENSES);

    const scopeCategoryId =
      overrides.scopeCategoryId === undefined
        ? scopeType === BudgetScopeType.CATEGORY ||
          scopeType === BudgetScopeType.CATEGORY_GROUP
          ? categoryId
          : null
        : (overrides.scopeCategoryId as string | null);

    return {
      id: 'budget-food',
      name: 'Food Budget',

      categoryId,
      category,
      scopeType,
      scopeCategoryId,
      scopeCategory,
      categoryScopes: [],

      period: 'MONTHLY',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: null,

      allocations: [
        {
          periodStart: new Date('2026-11-01T00:00:00.000Z'),
          amount: new Prisma.Decimal('1500000'),
        },
      ],

      ...overrides,
    };
  };

  const createTransactions = () => [
    {
      categoryId: 'category-food',
      amount: new Prisma.Decimal('1800000'),
      transactionDate: new Date('2026-09-15T05:00:00.000Z'),
    },
    {
      categoryId: 'category-food',
      amount: new Prisma.Decimal('1900000'),
      transactionDate: new Date('2026-10-15T05:00:00.000Z'),
    },
    {
      categoryId: 'category-food',
      amount: new Prisma.Decimal('2000000'),
      transactionDate: new Date('2026-11-15T05:00:00.000Z'),
    },
    {
      categoryId: 'category-transport',
      amount: new Prisma.Decimal('500000'),
      transactionDate: new Date('2026-09-15T05:00:00.000Z'),
    },
    {
      categoryId: 'category-transport',
      amount: new Prisma.Decimal('500000'),
      transactionDate: new Date('2026-10-15T05:00:00.000Z'),
    },
    {
      categoryId: 'category-transport',
      amount: new Prisma.Decimal('500000'),
      transactionDate: new Date('2026-11-15T05:00:00.000Z'),
    },
  ];

  const createAIResponse = () =>
    JSON.stringify({
      explanations: [
        {
          budgetId: 'budget-food',
          explanation:
            'Alokasi kategori ini perlu ditingkatkan agar lebih sesuai dengan pola kebutuhan aktual.',
          whyItMatters:
            'Kesesuaian alokasi membantu menjaga stabilitas pengelolaan pengeluaran.',
          suggestedActions: ['Tinjau kebutuhan rutin pada kategori ini.'],
        },
        {
          budgetId: 'budget-transport',
          explanation:
            'Alokasi kategori ini dapat disesuaikan dengan pola pengeluaran yang lebih efisien.',
          whyItMatters:
            'Penyesuaian membantu menyediakan ruang untuk kebutuhan keuangan lainnya.',
          suggestedActions: ['Evaluasi kebutuhan transportasi secara berkala.'],
        },
      ],
    });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-06T05:00:00.000Z'));

    jest.clearAllMocks();

    prismaMock.userPreference.findUnique.mockResolvedValue({
      timezone: 'Asia/Jakarta',
    });

    prismaMock.budget.findMany.mockResolvedValue([
      createBudget(),
      createBudget({
        id: 'budget-transport',
        name: 'Transport Budget',
        categoryId: 'category-transport',
        category: {
          id: 'category-transport',
          name: 'Transport',
          type: 'EXPENSE',
          isActive: true,
          deletedAt: null,
        },
        scopeCategory: {
          id: 'category-transport',
          name: 'Transport',
          type: 'EXPENSE',
          isActive: true,
          deletedAt: null,
        },
        scopeCategoryId: 'category-transport',
        allocations: [
          {
            periodStart: new Date('2026-11-01T00:00:00.000Z'),
            amount: new Prisma.Decimal('1500000'),
          },
        ],
      }),
    ]);

    prismaMock.transaction.aggregate.mockImplementation(
      (args: { where: { type: string } }) => {
        if (args.where.type === 'INCOME') {
          return Promise.resolve({
            _sum: {
              amount: new Prisma.Decimal('15000000'),
            },
          });
        }

        return Promise.resolve({
          _sum: {
            amount: new Prisma.Decimal('12000000'),
          },
        });
      },
    );

    prismaMock.transaction.findMany.mockResolvedValue(createTransactions());

    aiServiceMock.complete.mockResolvedValue({
      content: createAIResponse(),
      provider: 'openai-compatible',
      model: 'test-model',
      usage: {
        inputTokens: 100,
        outputTokens: 100,
        totalTokens: 200,
      },
    });

    service = new BudgetRecommendationsService(
      prismaMock as unknown as PrismaService,
      aiServiceMock as unknown as AIService,
      budgetScopeEngineMock as unknown as BudgetScopeEngine,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('generate', () => {
    it('should generate deterministic recommendations for the target month', async () => {
      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.status).toBe('GENERATED');
      expect(result.targetMonth).toBe('2026-12');
      expect(result.currency).toBe('IDR');
      expect(result.recommendations).toHaveLength(2);

      expect(result.financialCapacity).toEqual(
        expect.objectContaining({
          averageMonthlyIncome: '5000000',
          averageMonthlyExpense: '4000000',
          averageMonthlyNetCashFlow: '1000000',
          currentTotalAllocation: '3000000',
          maximumAllocationLimit: '4500000',
        }),
      );

      expect(prismaMock.budget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            status: 'ACTIVE',
            deletedAt: null,
          }),
          include: expect.objectContaining({
            scopeCategory: expect.any(Object),
            categoryScopes: expect.any(Object),
            allocations: expect.any(Object),
          }),
        }),
      );

      expect(prismaMock.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            type: 'EXPENSE',
            status: 'ACTIVE',
            currency: 'IDR',
          }),
        }),
      );
    });

    it('should recommend an increase when spending consistently exceeds allocation and capacity is available', async () => {
      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      const food = result.recommendations.find(
        (item) => item.budgetId === 'budget-food',
      );

      expect(food).toEqual(
        expect.objectContaining({
          action: 'INCREASE',
          currentAllocation: '1500000',
          proposedAllocation: '2000000',
          changeAmount: '500000',
          averageMonthlySpend: '1900000',
        }),
      );
    });

    it('should recommend a decrease while retaining at least seventy percent of current allocation', async () => {
      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      const transport = result.recommendations.find(
        (item) => item.budgetId === 'budget-transport',
      );

      expect(transport).toEqual(
        expect.objectContaining({
          action: 'DECREASE',
          currentAllocation: '1500000',
          proposedAllocation: '1050000',
          changeAmount: '-450000',
          averageMonthlySpend: '500000',
        }),
      );
    });

    it('should use only three completed months before the target month', async () => {
      await service.generate('user-1', {
        month: '2026-12',
      });

      const transactionQuery = prismaMock.transaction.findMany.mock.calls[0][0];

      expect(transactionQuery.where.transactionDate.gte.toISOString()).toBe(
        '2026-08-31T17:00:00.000Z',
      );

      expect(transactionQuery.where.transactionDate.lt.toISOString()).toBe(
        '2026-11-30T17:00:00.000Z',
      );
    });

    it('should return review when category history is insufficient', async () => {
      prismaMock.transaction.findMany.mockResolvedValue([
        {
          categoryId: 'category-food',
          amount: new Prisma.Decimal('1000000'),
          transactionDate: new Date('2026-11-15T05:00:00.000Z'),
        },
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      const food = result.recommendations.find(
        (item) => item.budgetId === 'budget-food',
      );

      expect(food?.action).toBe('REVIEW');
      expect(food?.proposedAllocation).toBe('1500000');
    });

    it('should not recommend an increase when average net cash flow is negative', async () => {
      prismaMock.transaction.aggregate.mockImplementation(
        (args: { where: { type: string } }) => {
          if (args.where.type === 'INCOME') {
            return Promise.resolve({
              _sum: {
                amount: new Prisma.Decimal('6000000'),
              },
            });
          }

          return Promise.resolve({
            _sum: {
              amount: new Prisma.Decimal('12000000'),
            },
          });
        },
      );

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      const food = result.recommendations.find(
        (item) => item.budgetId === 'budget-food',
      );

      expect(food?.action).toBe('REVIEW');
      expect(food?.proposedAllocation).toBe('1500000');
    });

    it('should return review for duplicate active budgets in the same category', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget(),
        createBudget({
          id: 'budget-food-duplicate',
          name: 'Food Budget Duplicate',
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(
        result.recommendations.every((item) => item.action === 'REVIEW'),
      ).toBe(true);
    });

    it('should not call AI when there are no eligible budgets', async () => {
      prismaMock.budget.findMany.mockResolvedValue([]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.status).toBe('NO_RECOMMENDATIONS');
      expect(result.recommendations).toEqual([]);

      expect(aiServiceMock.complete).not.toHaveBeenCalled();
      expect(prismaMock.transaction.aggregate).not.toHaveBeenCalled();
    });

    it('should keep deterministic recommendations when AI is unavailable', async () => {
      aiServiceMock.complete.mockRejectedValue(
        new Error('AI provider unavailable'),
      );

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.status).toBe('GENERATED');
      expect(result.recommendations).toHaveLength(2);
      expect(result.ai.status).toBe('UNAVAILABLE');

      expect(result.recommendations[0].reason).toBeTruthy();

      expect(
        result.recommendations.every((item) => item.aiExplanation === null),
      ).toBe(true);
    });

    it('should attach AI explanations only to known budget IDs', async () => {
      aiServiceMock.complete.mockResolvedValue({
        content: JSON.stringify({
          explanations: [
            {
              budgetId: 'budget-food',
              explanation:
                'Alokasi kategori ini perlu disesuaikan dengan kebutuhan aktual.',
              whyItMatters:
                'Penyesuaian membantu menjaga kestabilan pengeluaran.',
              suggestedActions: ['Tinjau kebutuhan rutin kategori ini.'],
            },
            {
              budgetId: 'unknown-budget',
              explanation: 'Penjelasan yang tidak valid.',
              whyItMatters: 'Alasan yang tidak valid.',
              suggestedActions: [],
            },
          ],
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      const food = result.recommendations.find(
        (item) => item.budgetId === 'budget-food',
      );

      const transport = result.recommendations.find(
        (item) => item.budgetId === 'budget-transport',
      );

      expect(food?.aiExplanation).toContain('Alokasi kategori');
      expect(transport?.aiExplanation).toBeNull();
    });

    it('should reject AI explanation containing monetary values or numeric claims', async () => {
      aiServiceMock.complete.mockResolvedValue({
        content: JSON.stringify({
          explanations: [
            {
              budgetId: 'budget-food',
              explanation: 'Alokasi perlu dinaikkan sebesar 20 persen.',
              whyItMatters: 'Penyesuaian membantu menjaga kestabilan.',
              suggestedActions: [],
            },
          ],
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      const food = result.recommendations.find(
        (item) => item.budgetId === 'budget-food',
      );

      expect(food?.aiExplanation).toBeNull();
      expect(result.ai.status).toBe('UNAVAILABLE');
    });

    it('should reject historical target months', async () => {
      await expect(
        service.generate('user-1', {
          month: '2026-10',
        }),
      ).rejects.toThrow(
        'Historical months cannot be used for budget recommendations',
      );
    });

    it('should reject invalid target month formats', async () => {
      await expect(
        service.generate('user-1', {
          month: '2026-13',
        }),
      ).rejects.toThrow('month must use YYYY-MM format');
    });

    it('should use the budget recommendations AI usage feature', async () => {
      await service.generate('user-1', {
        month: '2026-12',
      });

      expect(aiServiceMock.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.2,
          maxTokens: 1800,
          responseFormat: 'text',
        }),
        {
          userId: 'user-1',
          feature: 'BUDGET_RECOMMENDATIONS',
        },
      );
    });
  });

  describe('budget scope integration', () => {
    it('should resolve the scope of every eligible budget independently', async () => {
      await service.generate('user-1', {
        month: '2026-12',
      });

      expect(budgetScopeEngineMock.resolveCategoryIds).toHaveBeenCalledTimes(2);

      expect(budgetScopeEngineMock.resolveCategoryIds).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: BudgetScopeType.CATEGORY,
          scopeCategoryId: 'category-food',
        }),
      );

      expect(budgetScopeEngineMock.resolveCategoryIds).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: BudgetScopeType.CATEGORY,
          scopeCategoryId: 'category-transport',
        }),
      );
    });

    it('should include uncategorized transactions for ALL_EXPENSES budgets', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-all-expenses',
          name: 'All Expenses',
          categoryId: null,
          category: null,
          scopeCategory: null,
          scopeCategoryId: null,
          scopeType: BudgetScopeType.ALL_EXPENSES,
          allocations: [
            {
              periodStart: new Date('2026-11-01T00:00:00.000Z'),
              amount: new Prisma.Decimal('1500000'),
            },
          ],
        }),
      ]);

      prismaMock.transaction.findMany.mockResolvedValue([
        {
          categoryId: null,
          amount: new Prisma.Decimal('100000'),
          transactionDate: new Date('2026-09-15T05:00:00.000Z'),
        },
        {
          categoryId: null,
          amount: new Prisma.Decimal('200000'),
          transactionDate: new Date('2026-10-15T05:00:00.000Z'),
        },
        {
          categoryId: 'category-food',
          amount: new Prisma.Decimal('300000'),
          transactionDate: new Date('2026-11-15T05:00:00.000Z'),
        },
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      const recommendation = result.recommendations[0];

      expect(recommendation.categoryName).toBe('Semua Pengeluaran');
      expect(recommendation.transactionCount).toBe(3);
      expect(recommendation.averageMonthlySpend).toBe('200000');

      expect(
        prismaMock.transaction.findMany.mock.calls[0][0].where.categoryId,
      ).toBeUndefined();
    });

    it('should include the root category and its children for CATEGORY_GROUP budgets', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-food-group',
          name: 'Food Group Budget',
          categoryId: null,
          category: null,
          scopeType: BudgetScopeType.CATEGORY_GROUP,
          scopeCategoryId: 'root-food',
          scopeCategory: {
            id: 'root-food',
            name: 'Food',
            type: 'EXPENSE',
            isActive: true,
            deletedAt: null,
          },
          categoryScopes: [],
        }),
      ]);

      prismaMock.transaction.findMany.mockResolvedValue([
        {
          categoryId: 'root-food',
          amount: new Prisma.Decimal('100000'),
          transactionDate: new Date('2026-09-15T05:00:00.000Z'),
        },
        {
          categoryId: 'child-category-food',
          amount: new Prisma.Decimal('200000'),
          transactionDate: new Date('2026-10-15T05:00:00.000Z'),
        },
        {
          categoryId: 'category-transport',
          amount: new Prisma.Decimal('900000'),
          transactionDate: new Date('2026-11-15T05:00:00.000Z'),
        },
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      const recommendation = result.recommendations[0];

      expect(recommendation.categoryName).toBe('Food');
      expect(recommendation.transactionCount).toBe(2);
      expect(recommendation.averageMonthlySpend).toBe('100000');

      expect(budgetScopeEngineMock.resolveCategoryIds).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: BudgetScopeType.CATEGORY_GROUP,
          scopeCategoryId: 'root-food',
        }),
      );
    });

    it('should include only selected categories for CUSTOM budgets', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-custom',
          name: 'Custom Budget',
          categoryId: null,
          category: null,
          scopeCategory: null,
          scopeCategoryId: null,
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: [
            {
              categoryId: 'category-food',
              category: {
                id: 'category-food',
                name: 'Food',
                type: 'EXPENSE',
                isActive: true,
                deletedAt: null,
              },
            },
            {
              categoryId: 'category-transport',
              category: {
                id: 'category-transport',
                name: 'Transport',
                type: 'EXPENSE',
                isActive: true,
                deletedAt: null,
              },
            },
          ],
        }),
      ]);

      prismaMock.transaction.findMany.mockResolvedValue([
        {
          categoryId: 'category-food',
          amount: new Prisma.Decimal('100000'),
          transactionDate: new Date('2026-09-15T05:00:00.000Z'),
        },
        {
          categoryId: 'category-transport',
          amount: new Prisma.Decimal('200000'),
          transactionDate: new Date('2026-10-15T05:00:00.000Z'),
        },
        {
          categoryId: 'category-entertainment',
          amount: new Prisma.Decimal('900000'),
          transactionDate: new Date('2026-11-15T05:00:00.000Z'),
        },
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      const recommendation = result.recommendations[0];

      expect(recommendation.categoryName).toBe('Kategori kustom (2 kategori)');
      expect(recommendation.transactionCount).toBe(2);
      expect(recommendation.averageMonthlySpend).toBe('100000');

      expect(budgetScopeEngineMock.resolveCategoryIds).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: expect.arrayContaining([
            expect.objectContaining({ categoryId: 'category-food' }),
            expect.objectContaining({ categoryId: 'category-transport' }),
          ]),
        }),
      );
    });

    it('should not include uncategorized transactions for category-scoped budgets', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-food',
          scopeType: BudgetScopeType.CATEGORY,
          categoryId: 'category-food',
          scopeCategoryId: 'category-food',
        }),
      ]);

      prismaMock.transaction.findMany.mockResolvedValue([
        {
          categoryId: 'category-food',
          amount: new Prisma.Decimal('100000'),
          transactionDate: new Date('2026-09-15T05:00:00.000Z'),
        },
        {
          categoryId: null,
          amount: new Prisma.Decimal('900000'),
          transactionDate: new Date('2026-10-15T05:00:00.000Z'),
        },
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.recommendations[0].transactionCount).toBe(1);
      expect(result.recommendations[0].averageMonthlySpend).toBe('33333.3333');
    });

    it('should query the union of categories in one batch for category-scoped budgets', async () => {
      await service.generate('user-1', {
        month: '2026-12',
      });

      expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(1);

      expect(
        prismaMock.transaction.findMany.mock.calls[0][0].where.categoryId,
      ).toEqual({
        in: ['category-food', 'category-transport'],
      });
    });

    it('should not restrict the batch query when at least one budget uses ALL_EXPENSES', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-food',
        }),
        createBudget({
          id: 'budget-all-expenses',
          name: 'All Expenses',
          categoryId: null,
          category: null,
          scopeCategory: null,
          scopeCategoryId: null,
          scopeType: BudgetScopeType.ALL_EXPENSES,
        }),
      ]);

      await service.generate('user-1', {
        month: '2026-12',
      });

      expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(1);

      expect(
        prismaMock.transaction.findMany.mock.calls[0][0].where.categoryId,
      ).toBeUndefined();
    });

    it('should detect duplicate budgets with identical resolved scopes', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-food-1',
        }),
        createBudget({
          id: 'budget-food-2',
          name: 'Food Budget Duplicate',
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(
        result.recommendations.every(
          (recommendation) => recommendation.action === 'REVIEW',
        ),
      ).toBe(true);

      expect(
        result.recommendations.every((recommendation) =>
          recommendation.reason.includes('cakupan pengeluaran yang sama'),
        ),
      ).toBe(true);
    });

    it('should treat two ALL_EXPENSES budgets as duplicate scopes', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-all-1',
          categoryId: null,
          category: null,
          scopeCategory: null,
          scopeCategoryId: null,
          scopeType: BudgetScopeType.ALL_EXPENSES,
        }),
        createBudget({
          id: 'budget-all-2',
          categoryId: null,
          category: null,
          scopeCategory: null,
          scopeCategoryId: null,
          scopeType: BudgetScopeType.ALL_EXPENSES,
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(
        result.recommendations.every(
          (recommendation) => recommendation.action === 'REVIEW',
        ),
      ).toBe(true);
    });

    it('should exclude CUSTOM budgets with empty category scopes', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-custom-empty',
          categoryId: null,
          category: null,
          scopeCategory: null,
          scopeCategoryId: null,
          scopeType: BudgetScopeType.CUSTOM,
          categoryScopes: [],
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.status).toBe('NO_RECOMMENDATIONS');
      expect(result.eligibility).toEqual(
        expect.objectContaining({
          totalActiveBudgets: 1,
          eligibleBudgetCount: 0,
          excludedBudgetCount: 1,
        }),
      );

      expect(result.eligibility.excludedBudgets[0]).toEqual(
        expect.objectContaining({
          budgetId: 'budget-custom-empty',
          reason: 'EMPTY_CUSTOM_SCOPE',
        }),
      );

      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });

    it('should exclude CATEGORY budgets without a scope category', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-category-invalid',
          categoryId: null,
          category: null,
          scopeCategory: null,
          scopeCategoryId: null,
          scopeType: BudgetScopeType.CATEGORY,
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.status).toBe('NO_RECOMMENDATIONS');
      expect(result.eligibility.excludedBudgets[0]).toEqual(
        expect.objectContaining({
          budgetId: 'budget-category-invalid',
          reason: 'MISSING_SCOPE',
        }),
      );
    });

    it('should exclude CATEGORY_GROUP budgets without a root category', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-group-invalid',
          categoryId: null,
          category: null,
          scopeCategory: null,
          scopeCategoryId: null,
          scopeType: BudgetScopeType.CATEGORY_GROUP,
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.status).toBe('NO_RECOMMENDATIONS');
      expect(result.eligibility.excludedBudgets[0]).toEqual(
        expect.objectContaining({
          budgetId: 'budget-group-invalid',
          reason: 'MISSING_SCOPE',
        }),
      );
    });

    it('should exclude budgets that have no applicable allocation', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-no-allocation',
          allocations: [],
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.status).toBe('NO_RECOMMENDATIONS');
      expect(result.eligibility.excludedBudgets[0]).toEqual(
        expect.objectContaining({
          budgetId: 'budget-no-allocation',
          reason: 'NO_ALLOCATION',
        }),
      );
    });

    it('should exclude budgets that have not started by the target month', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-future',
          startDate: new Date('2027-01-01T00:00:00.000Z'),
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.status).toBe('NO_RECOMMENDATIONS');
      expect(result.eligibility.excludedBudgets[0]).toEqual(
        expect.objectContaining({
          budgetId: 'budget-future',
          reason: 'BUDGET_NOT_STARTED',
        }),
      );
    });

    it('should exclude budgets whose validity ended before the target month', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget({
          id: 'budget-expired',
          endDate: new Date('2026-11-30T00:00:00.000Z'),
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.status).toBe('NO_RECOMMENDATIONS');
      expect(result.eligibility.excludedBudgets[0]).toEqual(
        expect.objectContaining({
          budgetId: 'budget-expired',
          reason: 'BUDGET_PERIOD_EXPIRED',
        }),
      );
    });

    it('should expose eligibility counts for generated recommendations', async () => {
      prismaMock.budget.findMany.mockResolvedValue([
        createBudget(),
        createBudget({
          id: 'budget-invalid',
          scopeType: BudgetScopeType.CUSTOM,
          categoryId: null,
          category: null,
          scopeCategory: null,
          scopeCategoryId: null,
          categoryScopes: [],
        }),
      ]);

      const result = await service.generate('user-1', {
        month: '2026-12',
      });

      expect(result.eligibility).toEqual(
        expect.objectContaining({
          totalActiveBudgets: 2,
          eligibleBudgetCount: 1,
          excludedBudgetCount: 1,
        }),
      );
    });
  });
});
