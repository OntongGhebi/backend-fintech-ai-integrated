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
    findById: jest.Mock;
    findByIdAndUserId: jest.Mock;
    findManyByUserId: jest.Mock;
    findManyByUserIdAndStatus: jest.Mock;
    findByNameAndUserId: jest.Mock;
    findByNameAndUserIdExceptId: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };

  let categoriesService: {
    findById: jest.Mock;
  };

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
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-30'),
    status: BudgetStatus.ACTIVE,
    deletedAt: null,
    category: {
      id: categoryId,
      name: 'Food',
      type: 'EXPENSE',
    },
  };

  beforeEach(() => {
    budgetsRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUserId: jest.fn(),
      findManyByUserId: jest.fn(),
      findManyByUserIdAndStatus: jest.fn(),
      findByNameAndUserId: jest.fn(),
      findByNameAndUserIdExceptId: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    categoriesService = {
      findById: jest.fn(),
    };

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
      endDate: '2026-09-30',
      categoryId,
    };

    it('should create a budget successfully', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);

      categoriesService.findById.mockResolvedValue(baseBudget.category);

      budgetsRepository.create.mockResolvedValue(baseBudget);

      const result = await service.create(userId, createDto);

      expect(budgetsRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Monthly Food Budget',
        userId,
      );

      expect(categoriesService.findById).toHaveBeenCalledWith(
        categoryId,
        userId,
      );

      expect(budgetsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Monthly Food Budget',
          amount: '1500000',
          period: BudgetPeriod.MONTHLY,
          status: BudgetStatus.ACTIVE,
          endDate: expect.any(Date),
          category: {
            connect: {
              id: categoryId,
            },
          },
        }),
      );

      expect(result).toEqual(baseBudget);
    });

    it('should trim the budget name before creating', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);

      budgetsRepository.create.mockResolvedValue(baseBudget);

      await service.create(userId, {
        ...createDto,
        name: '  Monthly Food Budget  ',
        categoryId: undefined,
      });

      expect(budgetsRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Monthly Food Budget',
        userId,
      );

      expect(budgetsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Monthly Food Budget',
        }),
      );
    });

    it('should reject an empty budget name', async () => {
      await expect(
        service.create(userId, {
          ...createDto,
          name: '   ',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(budgetsRepository.findByNameAndUserId).not.toHaveBeenCalled();
    });

    it('should reject duplicate budget names', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(baseBudget);

      await expect(service.create(userId, createDto)).rejects.toThrow(
        ConflictException,
      );

      expect(budgetsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject an invalid date range', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);

      await expect(
        service.create(userId, {
          ...createDto,
          startDate: '2026-09-30',
          endDate: '2026-09-01',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(budgetsRepository.create).not.toHaveBeenCalled();
    });

    it('should allow a budget without a category', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);

      budgetsRepository.create.mockResolvedValue({
        ...baseBudget,
        categoryId: null,
        category: null,
      });

      await service.create(userId, {
        ...createDto,
        categoryId: undefined,
      });

      expect(categoriesService.findById).not.toHaveBeenCalled();

      expect(budgetsRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          category: expect.anything(),
        }),
      );
    });

    it('should validate the category through CategoriesService', async () => {
      budgetsRepository.findByNameAndUserId.mockResolvedValue(null);

      categoriesService.findById.mockRejectedValue(
        new NotFoundException('Category not found'),
      );

      await expect(service.create(userId, createDto)).rejects.toThrow(
        NotFoundException,
      );

      expect(budgetsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all budgets for the user', async () => {
      const budgets = [baseBudget];

      budgetsRepository.findManyByUserId.mockResolvedValue(budgets);

      const query: GetBudgetsQueryDto = {};

      const result = await service.findAll(userId, query);

      expect(budgetsRepository.findManyByUserId).toHaveBeenCalledWith(userId);

      expect(result).toEqual(budgets);
    });

    it('should filter budgets by status', async () => {
      const budgets = [baseBudget];

      budgetsRepository.findManyByUserIdAndStatus.mockResolvedValue(budgets);

      const query: GetBudgetsQueryDto = {
        status: BudgetStatus.ACTIVE,
      };

      const result = await service.findAll(userId, query);

      expect(budgetsRepository.findManyByUserIdAndStatus).toHaveBeenCalledWith(
        userId,
        BudgetStatus.ACTIVE,
      );

      expect(result).toEqual(budgets);

      expect(budgetsRepository.findManyByUserId).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return the budget belonging to the user', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(baseBudget);

      const result = await service.findById(userId, budgetId);

      expect(budgetsRepository.findByIdAndUserId).toHaveBeenCalledWith(
        budgetId,
        userId,
      );

      expect(result).toEqual(baseBudget);
    });

    it('should throw NotFoundException when the budget does not belong to the user', async () => {
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

      budgetsRepository.update.mockResolvedValue({
        count: 1,
      });

      budgetsRepository.findByIdAndUserId.mockResolvedValue(baseBudget);
    });

    it('should update the budget name', async () => {
      const dto: UpdateBudgetDto = {
        name: '  Updated Food Budget  ',
      };

      await service.update(userId, budgetId, dto);

      expect(
        budgetsRepository.findByNameAndUserIdExceptId,
      ).toHaveBeenCalledWith('Updated Food Budget', userId, budgetId);

      expect(budgetsRepository.update).toHaveBeenCalledWith(
        budgetId,
        userId,
        expect.objectContaining({
          name: 'Updated Food Budget',
        }),
      );
    });

    it('should reject duplicate names during update', async () => {
      budgetsRepository.findByNameAndUserIdExceptId.mockResolvedValue({
        ...baseBudget,
        id: otherBudgetId,
        name: 'Transport Budget',
      });

      await expect(
        service.update(userId, budgetId, {
          name: 'Transport Budget',
        }),
      ).rejects.toThrow(ConflictException);

      expect(budgetsRepository.update).not.toHaveBeenCalled();
    });

    it('should update amount and period', async () => {
      await service.update(userId, budgetId, {
        amount: '2000000',
        period: BudgetPeriod.YEARLY,
      });

      expect(budgetsRepository.update).toHaveBeenCalledWith(
        budgetId,
        userId,
        expect.objectContaining({
          amount: '2000000',
          period: BudgetPeriod.YEARLY,
        }),
      );
    });

    it('should update the date range', async () => {
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

    it('should reject an invalid date range during update', async () => {
      await expect(
        service.update(userId, budgetId, {
          startDate: '2026-12-31',
          endDate: '2026-10-01',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(budgetsRepository.update).not.toHaveBeenCalled();
    });

    it('should connect a new category', async () => {
      categoriesService.findById.mockResolvedValue({
        id: categoryId,
      });

      await service.update(userId, budgetId, {
        categoryId,
      });

      expect(categoriesService.findById).toHaveBeenCalledWith(
        categoryId,
        userId,
      );

      expect(budgetsRepository.update).toHaveBeenCalledWith(
        budgetId,
        userId,
        expect.objectContaining({
          categoryId,
        }),
      );
    });

    it('should disconnect the category when categoryId is null', async () => {
      await service.update(userId, budgetId, {
        categoryId: null,
      });

      expect(categoriesService.findById).not.toHaveBeenCalled();

      expect(budgetsRepository.update).toHaveBeenCalledWith(budgetId, userId, {
        categoryId: null,
      });
    });

    it('should return the existing budget when no fields are provided', async () => {
      const result = await service.update(userId, budgetId, {});

      expect(budgetsRepository.update).not.toHaveBeenCalled();

      expect(result).toEqual(baseBudget);
    });

    it('should throw NotFoundException when updating a missing budget', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.update(userId, budgetId, {
          name: 'Updated Budget',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(budgetsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    const updateStatusDto: UpdateBudgetStatusDto = {
      status: BudgetStatus.PAUSED,
    };

    it('should update the budget status', async () => {
      budgetsRepository.findByIdAndUserId
        .mockResolvedValueOnce(baseBudget)
        .mockResolvedValueOnce({
          ...baseBudget,
          status: BudgetStatus.PAUSED,
        });

      budgetsRepository.update.mockResolvedValue({
        count: 1,
      });

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

    it('should return the existing budget when the status is unchanged', async () => {
      const sameStatusDto: UpdateBudgetStatusDto = {
        status: BudgetStatus.ACTIVE,
      };

      budgetsRepository.findByIdAndUserId.mockResolvedValue(baseBudget);

      const result = await service.updateStatus(
        userId,
        budgetId,
        sameStatusDto,
      );

      expect(budgetsRepository.update).not.toHaveBeenCalled();

      expect(result).toEqual(baseBudget);
    });

    it('should throw NotFoundException when the budget does not exist', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.updateStatus(userId, budgetId, updateStatusDto),
      ).rejects.toThrow(NotFoundException);

      expect(budgetsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should archive the budget successfully', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(baseBudget);

      budgetsRepository.softDelete.mockResolvedValue({
        count: 1,
      });

      const result = await service.remove(userId, budgetId);

      expect(budgetsRepository.softDelete).toHaveBeenCalledWith(
        budgetId,
        userId,
      );

      expect(result).toEqual({
        message: 'Budget archived successfully',
      });
    });

    it('should throw NotFoundException when archiving a missing budget', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.remove(userId, budgetId)).rejects.toThrow(
        NotFoundException,
      );

      expect(budgetsRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should not archive another user budget', async () => {
      budgetsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.remove(userId, otherBudgetId)).rejects.toThrow(
        NotFoundException,
      );

      expect(budgetsRepository.softDelete).not.toHaveBeenCalled();
    });
  });
});
