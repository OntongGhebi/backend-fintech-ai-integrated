import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { BudgetStatus } from 'src/database/enums/budget-status.enum';
import { BudgetPeriod } from 'src/database/enums/budget-period.enum';

import { CategoriesService } from '../categories/categories.service';

import { CreateBudgetDto } from './dto/create-budget.dto';
import { GetBudgetsQueryDto } from './dto/get-budgets-query.dto';
import { UpdateBudgetStatusDto } from './dto/update-budget-status.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { BudgetsRepository } from './repositories/budgets.repository';
import { BudgetsService } from './budgets.service';

describe('BudgetsService', () => {
  let service: BudgetsService;

  let budgetsRepository: {
    create: jest.Mock;
    createWithInitialAllocation: jest.Mock;
    findById: jest.Mock;
    findByIdAndUserId: jest.Mock;
    findManyByUserId: jest.Mock;
    findManyByUserIdAndStatus: jest.Mock;
    findByNameAndUserId: jest.Mock;
    findByNameAndUserIdExceptId: jest.Mock;
    update: jest.Mock;
    updateWithAllocations: jest.Mock;
    softDelete: jest.Mock;
  };

  let categoriesService: { findById: jest.Mock };

  const userId = '11111111-1111-4111-8111-111111111111';
  const budgetId = '22222222-2222-4222-8222-222222222222';
  const categoryId = '33333333-3333-4333-8333-333333333333';
  const otherBudgetId = '44444444-4444-4444-8444-444444444444';

  const baseBudget = {
    id: budgetId,
    userId,
    categoryId,
    name: 'Monthly Food Budget',
    amount: '1500000',
    period: BudgetPeriod.MONTHLY,
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    status: BudgetStatus.ACTIVE,
    deletedAt: null,
    category: { id: categoryId, name: 'Food', type: 'EXPENSE' },
    allocations: [],
  };

  beforeEach(() => {
    budgetsRepository = {
      create: jest.fn(),
      createWithInitialAllocation: jest.fn(),
      findById: jest.fn(),
      findByIdAndUserId: jest.fn(),
      findManyByUserId: jest.fn(),
      findManyByUserIdAndStatus: jest.fn(),
      findByNameAndUserId: jest.fn(),
      findByNameAndUserIdExceptId: jest.fn(),
      update: jest.fn(),
      updateWithAllocations: jest.fn(),
      softDelete: jest.fn(),
    };

    categoriesService = { findById: jest.fn() };

    service = new BudgetsService(
      budgetsRepository as unknown as BudgetsRepository,
      categoriesService as unknown as CategoriesService,
    );
  });

  describe('create', () => {
    const createDto: CreateBudgetDto = {
      name: 'Monthly Food Budget',
      amount: '1500000',
      period: BudgetPeriod.MONTHLY,
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      categoryId,
    };

    it('creates a budget and its first monthly allocation', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);
      categoriesService.findById.mockResolvedValue(baseBudget.category);
      budgetsRepository.createWithInitialAllocation.mockResolvedValue(
        baseBudget,
      );

      const result = await service.create(userId, createDto);

      expect(budgetsRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Monthly Food Budget',
        userId,
      );
      expect(categoriesService.findById).toHaveBeenCalledWith(
        categoryId,
        userId,
      );
      expect(
        budgetsRepository.createWithInitialAllocation,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Monthly Food Budget',
          amount: '1500000',
          period: BudgetPeriod.MONTHLY,
          status: BudgetStatus.ACTIVE,
          endDate: expect.any(Date),
          category: { connect: { id: categoryId } },
        }),
        new Date('2026-09-01T00:00:00.000Z'),
        '1500000',
      );
      expect(result).toEqual(baseBudget);
    });

    it('trims the budget name before creating', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);
      budgetsRepository.createWithInitialAllocation.mockResolvedValue(
        baseBudget,
      );

      await service.create(userId, {
        ...createDto,
        name: '  Monthly Food Budget  ',
        categoryId: undefined,
      });

      expect(budgetsRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Monthly Food Budget',
        userId,
      );
      expect(
        budgetsRepository.createWithInitialAllocation,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Monthly Food Budget' }),
        expect.any(Date),
        '1500000',
      );
    });

    it('rejects an empty budget name', async () => {
      await expect(
        service.create(userId, { ...createDto, name: '   ' }),
      ).rejects.toThrow(BadRequestException);
      expect(budgetsRepository.findByNameAndUserId).not.toHaveBeenCalled();
    });

    it('rejects zero and negative amounts', async () => {
      for (const amount of ['0', '-1', '0.0000']) {
        await expect(
          service.create(userId, { ...createDto, amount }),
        ).rejects.toThrow(BadRequestException);
      }
      expect(
        budgetsRepository.createWithInitialAllocation,
      ).not.toHaveBeenCalled();
    });

    it('rejects duplicate budget names', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(baseBudget);

      await expect(service.create(userId, createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(
        budgetsRepository.createWithInitialAllocation,
      ).not.toHaveBeenCalled();
    });

    it('rejects an invalid date range', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);

      await expect(
        service.create(userId, {
          ...createDto,
          startDate: '2026-09-30',
          endDate: '2026-09-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(
        budgetsRepository.createWithInitialAllocation,
      ).not.toHaveBeenCalled();
    });

    it('allows a budget without a category', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);
      budgetsRepository.createWithInitialAllocation.mockResolvedValue({
        ...baseBudget,
        categoryId: null,
        category: null,
      });

      await service.create(userId, { ...createDto, categoryId: undefined });

      expect(categoriesService.findById).not.toHaveBeenCalled();
      expect(
        budgetsRepository.createWithInitialAllocation,
      ).toHaveBeenCalledWith(
        expect.not.objectContaining({ category: expect.anything() }),
        expect.any(Date),
        '1500000',
      );
    });

    it('validates the category through CategoriesService', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);
      categoriesService.findById.mockRejectedValue(
        new NotFoundException('Category not found'),
      );

      await expect(service.create(userId, createDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(
        budgetsRepository.createWithInitialAllocation,
      ).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns all budgets for the user', async () => {
      budgetsRepository.findManyByUserId.mockResolvedValue([baseBudget]);

      const result = await service.findAll(userId, {});

      expect(budgetsRepository.findManyByUserId).toHaveBeenCalledWith(
        userId,
        undefined,
      );
      expect(result).toEqual([baseBudget]);
    });

    it('filters by status and month', async () => {
      budgetsRepository.findManyByUserIdAndStatus.mockResolvedValue([
        baseBudget,
      ]);

      const query: GetBudgetsQueryDto = {
        status: BudgetStatus.ACTIVE,
        month: '2026-11-01',
      };

      const result = await service.findAll(userId, query);

      expect(budgetsRepository.findManyByUserIdAndStatus).toHaveBeenCalledWith(
        userId,
        BudgetStatus.ACTIVE,
        new Date('2026-11-01T00:00:00.000Z'),
      );
      expect(result).toEqual([baseBudget]);
      expect(budgetsRepository.findManyByUserId).not.toHaveBeenCalled();
    });

    it('rejects a month that is not the first day', async () => {
      await expect(
        service.findAll(userId, { month: '2026-11-02' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findById', () => {
    it('returns the budget belonging to the user', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(baseBudget);

      const result = await service.findById(userId, budgetId);

      expect(budgetsRepository.findByIdAndUserId).toHaveBeenCalledWith(
        budgetId,
        userId,
        undefined,
      );
      expect(result).toEqual(baseBudget);
    });

    it('passes the selected month to the repository', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(baseBudget);

      await service.findById(userId, budgetId, { month: '2026-11-01' });

      expect(budgetsRepository.findByIdAndUserId).toHaveBeenCalledWith(
        budgetId,
        userId,
        new Date('2026-11-01T00:00:00.000Z'),
      );
    });

    it('throws NotFoundException for a budget not owned by the user', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(userId, otherBudgetId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(baseBudget);
      budgetsRepository.findByNameAndUserIdExceptId.mockResolvedValue(null);
      budgetsRepository.update.mockResolvedValue({ count: 1 });
      budgetsRepository.updateWithAllocations.mockResolvedValue(baseBudget);
    });

    it('updates the budget name', async () => {
      await service.update(userId, budgetId, {
        name: '  Updated Food Budget  ',
      });

      expect(
        budgetsRepository.findByNameAndUserIdExceptId,
      ).toHaveBeenCalledWith('Updated Food Budget', userId, budgetId);
      expect(budgetsRepository.update).toHaveBeenCalledWith(
        budgetId,
        userId,
        expect.objectContaining({ name: 'Updated Food Budget' }),
      );
    });

    it('rejects duplicate names during update', async () => {
      budgetsRepository.findByNameAndUserIdExceptId.mockResolvedValue({
        ...baseBudget,
        id: otherBudgetId,
        name: 'Transport Budget',
      });

      await expect(
        service.update(userId, budgetId, { name: 'Transport Budget' }),
      ).rejects.toThrow(ConflictException);
      expect(budgetsRepository.update).not.toHaveBeenCalled();
      expect(budgetsRepository.updateWithAllocations).not.toHaveBeenCalled();
    });

    it('requires periodStart when amount is updated', async () => {
      await expect(
        service.update(userId, budgetId, { amount: '2000000' }),
      ).rejects.toThrow('periodStart is required');
      expect(budgetsRepository.updateWithAllocations).not.toHaveBeenCalled();
    });

    it('rejects periodStart without amount', async () => {
      await expect(
        service.update(userId, budgetId, { periodStart: '2026-11-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates only the selected month by default', async () => {
      await service.update(userId, budgetId, {
        amount: '2000000',
        periodStart: '2026-11-01',
      });

      expect(budgetsRepository.updateWithAllocations).toHaveBeenCalledWith(
        budgetId,
        userId,
        expect.objectContaining({ amount: '2000000' }),
        [
          {
            periodStart: new Date('2026-11-01T00:00:00.000Z'),
            amount: '2000000',
          },
        ],
      );
      expect(budgetsRepository.update).not.toHaveBeenCalled();
    });

    it('updates the selected and following months when explicitly requested', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue({
        ...baseBudget,
        endDate: new Date('2027-01-31T00:00:00.000Z'),
      });

      await service.update(userId, budgetId, {
        amount: '2200000',
        periodStart: '2026-11-01',
        applyToFuture: true,
        futureMonths: 3,
      });

      expect(budgetsRepository.updateWithAllocations).toHaveBeenCalledWith(
        budgetId,
        userId,
        expect.objectContaining({ amount: '2200000' }),
        [
          {
            periodStart: new Date('2026-11-01T00:00:00.000Z'),
            amount: '2200000',
          },
          {
            periodStart: new Date('2026-12-01T00:00:00.000Z'),
            amount: '2200000',
          },
          {
            periodStart: new Date('2027-01-01T00:00:00.000Z'),
            amount: '2200000',
          },
        ],
      );
    });

    it('uses twelve months by default and caps at budget endDate', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue({
        ...baseBudget,
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      });

      await service.update(userId, budgetId, {
        amount: '2100000',
        periodStart: '2026-11-01',
        applyToFuture: true,
      });

      const allocations =
        budgetsRepository.updateWithAllocations.mock.calls[0][3];
      expect(allocations).toHaveLength(2);
      expect(allocations[1].periodStart).toEqual(
        new Date('2026-12-01T00:00:00.000Z'),
      );
    });

    it('rejects an explicitly requested future range beyond endDate', async () => {
      await expect(
        service.update(userId, budgetId, {
          amount: '2200000',
          periodStart: '2026-11-01',
          applyToFuture: true,
          futureMonths: 4,
        }),
      ).rejects.toThrow('futureMonths exceeds');
      expect(budgetsRepository.updateWithAllocations).not.toHaveBeenCalled();
    });

    it('rejects historical allocation changes', async () => {
      await expect(
        service.update(userId, budgetId, {
          amount: '2000000',
          periodStart: '2026-10-01',
        }),
      ).rejects.toThrow('Historical budget allocations');
      expect(budgetsRepository.updateWithAllocations).not.toHaveBeenCalled();
    });

    it('rejects invalid month format', async () => {
      await expect(
        service.update(userId, budgetId, {
          amount: '2000000',
          periodStart: '2026-11-02',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects zero or negative allocation amounts', async () => {
      for (const amount of ['0', '-10', '0.0000']) {
        await expect(
          service.update(userId, budgetId, {
            amount,
            periodStart: '2026-11-01',
          }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects futureMonths unless applyToFuture is true', async () => {
      await expect(
        service.update(userId, budgetId, {
          amount: '2000000',
          periodStart: '2026-11-01',
          futureMonths: 2,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an allocation outside the budget date range', async () => {
      await expect(
        service.update(userId, budgetId, {
          amount: '2000000',
          periodStart: '2027-01-01',
        }),
      ).rejects.toThrow('periodStart cannot be later');
    });

    it('updates the date range', async () => {
      await service.update(userId, budgetId, {
        startDate: '2026-10-01',
        endDate: '2026-12-31',
      });

      expect(budgetsRepository.update).toHaveBeenCalledWith(
        budgetId,
        userId,
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      );
    });

    it('rejects an invalid date range during update', async () => {
      await expect(
        service.update(userId, budgetId, {
          startDate: '2026-12-31',
          endDate: '2026-10-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(budgetsRepository.update).not.toHaveBeenCalled();
    });

    it('connects a new category', async () => {
      categoriesService.findById.mockResolvedValue({ id: categoryId });

      await service.update(userId, budgetId, { categoryId });

      expect(categoriesService.findById).toHaveBeenCalledWith(
        categoryId,
        userId,
      );
      expect(budgetsRepository.update).toHaveBeenCalledWith(
        budgetId,
        userId,
        expect.objectContaining({ categoryId }),
      );
    });

    it('disconnects the category when categoryId is null', async () => {
      await service.update(userId, budgetId, { categoryId: null });

      expect(categoriesService.findById).not.toHaveBeenCalled();
      expect(budgetsRepository.update).toHaveBeenCalledWith(budgetId, userId, {
        categoryId: null,
      });
    });

    it('returns the existing budget when no fields are provided', async () => {
      const result = await service.update(userId, budgetId, {});

      expect(budgetsRepository.update).not.toHaveBeenCalled();
      expect(budgetsRepository.updateWithAllocations).not.toHaveBeenCalled();
      expect(result).toEqual(baseBudget);
    });

    it('throws NotFoundException when updating a missing budget', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.update(userId, budgetId, { name: 'Updated Budget' }),
      ).rejects.toThrow(NotFoundException);
      expect(budgetsRepository.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if the budget disappears before transaction update', async () => {
      budgetsRepository.updateWithAllocations.mockResolvedValue(null);

      await expect(
        service.update(userId, budgetId, {
          amount: '2000000',
          periodStart: '2026-11-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    const updateStatusDto: UpdateBudgetStatusDto = {
      status: BudgetStatus.PAUSED,
    };

    it('updates the budget status', async () => {
      budgetsRepository.findByIdAndUserId
        .mockResolvedValueOnce(baseBudget)
        .mockResolvedValueOnce({
          ...baseBudget,
          status: BudgetStatus.PAUSED,
        });

      budgetsRepository.update.mockResolvedValue({ count: 1 });

      const result = await service.updateStatus(
        userId,
        budgetId,
        updateStatusDto,
      );

      expect(budgetsRepository.update).toHaveBeenCalledWith(budgetId, userId, {
        status: BudgetStatus.PAUSED,
      });
      expect(result.status).toBe(BudgetStatus.PAUSED);
    });

    it('returns the existing budget when status is unchanged', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(baseBudget);

      const result = await service.updateStatus(userId, budgetId, {
        status: BudgetStatus.ACTIVE,
      });

      expect(budgetsRepository.update).not.toHaveBeenCalled();
      expect(result).toEqual(baseBudget);
    });

    it('throws NotFoundException when budget does not exist', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.updateStatus(userId, budgetId, updateStatusDto),
      ).rejects.toThrow(NotFoundException);
      expect(budgetsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('archives the budget successfully', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(baseBudget);
      budgetsRepository.softDelete.mockResolvedValue({ count: 1 });

      const result = await service.remove(userId, budgetId);

      expect(budgetsRepository.softDelete).toHaveBeenCalledWith(
        budgetId,
        userId,
      );
      expect(result).toEqual({ message: 'Budget archived successfully' });
    });

    it('throws NotFoundException when archiving a missing budget', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.remove(userId, budgetId)).rejects.toThrow(
        NotFoundException,
      );
      expect(budgetsRepository.softDelete).not.toHaveBeenCalled();
    });

    it('does not archive another user budget', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.remove(userId, otherBudgetId)).rejects.toThrow(
        NotFoundException,
      );
      expect(budgetsRepository.softDelete).not.toHaveBeenCalled();
    });
  });
});
