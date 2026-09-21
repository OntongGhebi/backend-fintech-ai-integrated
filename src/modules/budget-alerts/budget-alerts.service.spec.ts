import { NotFoundException } from '@nestjs/common';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';

import { BudgetsService } from '../budgets/budgets.service';

import { CreateBudgetAlertDto } from './dto/create-budget-alert.dto';
import { GetBudgetAlertsQueryDto } from './dto/get-budget-alerts-query.dto';
import { UpdateBudgetAlertDto } from './dto/update-budget-alert.dto';
import { BudgetAlertsRepository } from './budget-alerts.repository';
import { BudgetAlertsService } from './budget-alerts.service';

describe('BudgetAlertsService', () => {
  let service: BudgetAlertsService;
  let repository: jest.Mocked<BudgetAlertsRepository>;
  let budgetsService: jest.Mocked<BudgetsService>;

  const userId = 'user-uuid-1';
  const otherUserId = 'user-uuid-2';

  const budgetId = 'budget-uuid-1';
  const otherBudgetId = 'budget-uuid-2';

  const alertId = 'alert-uuid-1';
  const otherAlertId = 'alert-uuid-2';

  const baseBudget = {
    id: budgetId,
    userId,
    categoryId: null,
    name: 'Monthly Food Budget',
    amount: '1500000',
    period: 'MONTHLY',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-30T00:00:00.000Z'),
    status: 'ACTIVE',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    deletedAt: null,
    category: null,
  };

  const baseAlert = {
    id: alertId,
    budgetId,
    thresholdPercentage: 80,
    channel: NotificationChannel.TELEGRAM,
    isEnabled: true,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    budget: baseBudget,
  };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUserId: jest.fn(),
      findManyByBudgetIdAndUserId: jest.fn(),
      findManyByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<BudgetAlertsRepository>;

    budgetsService = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<BudgetsService>;

    service = new BudgetAlertsService(repository, budgetsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a budget alert successfully', async () => {
      const dto: CreateBudgetAlertDto = {
        thresholdPercentage: 80,
        channel: NotificationChannel.TELEGRAM,
      };

      budgetsService.findById.mockResolvedValue(baseBudget as never);
      repository.create.mockResolvedValue(baseAlert as never);

      const result = await service.create(userId, budgetId, dto);

      expect(budgetsService.findById).toHaveBeenCalledWith(userId, budgetId);

      expect(repository.create).toHaveBeenCalledWith({
        budget: {
          connect: {
            id: budgetId,
          },
        },
        thresholdPercentage: 80,
        channel: NotificationChannel.TELEGRAM,
        isEnabled: true,
      });

      expect(result).toEqual(baseAlert);
    });

    it('should not create an alert when the budget does not belong to the user', async () => {
      budgetsService.findById.mockRejectedValue(
        new NotFoundException('Budget not found'),
      );

      const dto: CreateBudgetAlertDto = {
        thresholdPercentage: 80,
        channel: NotificationChannel.TELEGRAM,
      };

      await expect(service.create(userId, otherBudgetId, dto)).rejects.toThrow(
        new NotFoundException('Budget not found'),
      );

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should create the alert as enabled by default', async () => {
      const dto: CreateBudgetAlertDto = {
        thresholdPercentage: 90,
        channel: NotificationChannel.EMAIL,
      };

      budgetsService.findById.mockResolvedValue(baseBudget as never);
      repository.create.mockResolvedValue({
        ...baseAlert,
        thresholdPercentage: 90,
        channel: NotificationChannel.EMAIL,
      } as never);

      await service.create(userId, budgetId, dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return all budget alerts belonging to the user', async () => {
      const query: GetBudgetAlertsQueryDto = {};

      repository.findManyByUserId.mockResolvedValue([baseAlert] as never);

      const result = await service.findAll(userId, query);

      expect(repository.findManyByUserId).toHaveBeenCalledWith(userId, query);

      expect(result).toEqual([baseAlert]);
    });

    it('should pass filters to the repository', async () => {
      const query: GetBudgetAlertsQueryDto = {
        channel: NotificationChannel.TELEGRAM,
        isEnabled: true,
      };

      repository.findManyByUserId.mockResolvedValue([baseAlert] as never);

      await service.findAll(userId, query);

      expect(repository.findManyByUserId).toHaveBeenCalledWith(userId, query);
    });

    it('should return an empty array when the user has no alerts', async () => {
      repository.findManyByUserId.mockResolvedValue([]);

      const result = await service.findAll(userId, {});

      expect(result).toEqual([]);
    });
  });

  describe('findAllByBudget', () => {
    it('should return alerts belonging to a specific budget', async () => {
      const query: GetBudgetAlertsQueryDto = {};

      budgetsService.findById.mockResolvedValue(baseBudget as never);

      repository.findManyByBudgetIdAndUserId.mockResolvedValue([
        baseAlert,
      ] as never);

      const result = await service.findAllByBudget(userId, budgetId, query);

      expect(budgetsService.findById).toHaveBeenCalledWith(userId, budgetId);

      expect(repository.findManyByBudgetIdAndUserId).toHaveBeenCalledWith(
        budgetId,
        userId,
        query,
      );

      expect(result).toEqual([baseAlert]);
    });

    it('should not return alerts when the budget is not accessible', async () => {
      budgetsService.findById.mockRejectedValue(
        new NotFoundException('Budget not found'),
      );

      await expect(
        service.findAllByBudget(userId, otherBudgetId, {}),
      ).rejects.toThrow(new NotFoundException('Budget not found'));

      expect(repository.findManyByBudgetIdAndUserId).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return an alert owned by the user', async () => {
      repository.findByIdAndUserId.mockResolvedValue(baseAlert as never);

      const result = await service.findById(userId, alertId);

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        alertId,
        userId,
      );

      expect(result).toEqual(baseAlert);
    });

    it('should throw NotFoundException when alert does not exist', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(userId, alertId)).rejects.toThrow(
        new NotFoundException('Budget alert not found'),
      );
    });

    it('should not expose another user alert', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(otherUserId, alertId)).rejects.toThrow(
        new NotFoundException('Budget alert not found'),
      );

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        alertId,
        otherUserId,
      );
    });
  });

  describe('update', () => {
    it('should update threshold percentage', async () => {
      const dto: UpdateBudgetAlertDto = {
        thresholdPercentage: 90,
      };

      const updatedAlert = {
        ...baseAlert,
        thresholdPercentage: 90,
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAlert as never)
        .mockResolvedValueOnce(updatedAlert as never);

      repository.update.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.update(userId, alertId, dto);

      expect(repository.update).toHaveBeenCalledWith(alertId, userId, {
        thresholdPercentage: 90,
      });

      expect(result).toEqual(updatedAlert);
    });

    it('should update notification channel', async () => {
      const dto: UpdateBudgetAlertDto = {
        channel: NotificationChannel.EMAIL,
      };

      const updatedAlert = {
        ...baseAlert,
        channel: NotificationChannel.EMAIL,
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAlert as never)
        .mockResolvedValueOnce(updatedAlert as never);

      repository.update.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.update(userId, alertId, dto);

      expect(repository.update).toHaveBeenCalledWith(alertId, userId, {
        channel: NotificationChannel.EMAIL,
      });

      expect(result).toEqual(updatedAlert);
    });

    it('should update enabled state', async () => {
      const dto: UpdateBudgetAlertDto = {
        isEnabled: false,
      };

      const updatedAlert = {
        ...baseAlert,
        isEnabled: false,
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAlert as never)
        .mockResolvedValueOnce(updatedAlert as never);

      repository.update.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.update(userId, alertId, dto);

      expect(repository.update).toHaveBeenCalledWith(alertId, userId, {
        isEnabled: false,
      });

      expect(result).toEqual(updatedAlert);
    });

    it('should update multiple fields at once', async () => {
      const dto: UpdateBudgetAlertDto = {
        thresholdPercentage: 95,
        channel: NotificationChannel.EMAIL,
        isEnabled: false,
      };

      const updatedAlert = {
        ...baseAlert,
        thresholdPercentage: 95,
        channel: NotificationChannel.EMAIL,
        isEnabled: false,
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAlert as never)
        .mockResolvedValueOnce(updatedAlert as never);

      repository.update.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.update(userId, alertId, dto);

      expect(repository.update).toHaveBeenCalledWith(alertId, userId, {
        thresholdPercentage: 95,
        channel: NotificationChannel.EMAIL,
        isEnabled: false,
      });

      expect(result).toEqual(updatedAlert);
    });

    it('should return the existing alert when there are no fields to update', async () => {
      const dto: UpdateBudgetAlertDto = {};

      repository.findByIdAndUserId.mockResolvedValue(baseAlert as never);

      const result = await service.update(userId, alertId, dto);

      expect(result).toEqual(baseAlert);

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when alert does not exist', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.update(userId, alertId, {
          thresholdPercentage: 90,
        }),
      ).rejects.toThrow(new NotFoundException('Budget alert not found'));

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('setEnabled', () => {
    it('should enable a disabled alert', async () => {
      const disabledAlert = {
        ...baseAlert,
        isEnabled: false,
      };

      const enabledAlert = {
        ...baseAlert,
        isEnabled: true,
      };

      repository.findByIdAndUserId
        .mockResolvedValueOnce(disabledAlert as never)
        .mockResolvedValueOnce(enabledAlert as never);

      repository.update.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.setEnabled(userId, alertId, true);

      expect(repository.update).toHaveBeenCalledWith(alertId, userId, {
        isEnabled: true,
      });

      expect(result).toEqual(enabledAlert);
    });

    it('should disable an enabled alert', async () => {
      repository.findByIdAndUserId
        .mockResolvedValueOnce(baseAlert as never)
        .mockResolvedValueOnce({
          ...baseAlert,
          isEnabled: false,
        } as never);

      repository.update.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.setEnabled(userId, alertId, false);

      expect(repository.update).toHaveBeenCalledWith(alertId, userId, {
        isEnabled: false,
      });

      expect(result.isEnabled).toBe(false);
    });

    it('should return the existing alert when the enabled state is unchanged', async () => {
      repository.findByIdAndUserId.mockResolvedValue(baseAlert as never);

      const result = await service.setEnabled(userId, alertId, true);

      expect(result).toEqual(baseAlert);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when alert does not exist', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.setEnabled(userId, alertId, false)).rejects.toThrow(
        new NotFoundException('Budget alert not found'),
      );

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete an alert owned by the user', async () => {
      repository.findByIdAndUserId.mockResolvedValue(baseAlert as never);

      repository.delete.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.remove(userId, alertId);

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        alertId,
        userId,
      );

      expect(repository.delete).toHaveBeenCalledWith(alertId, userId);

      expect(result).toEqual({
        message: 'Budget alert deleted successfully',
      });
    });

    it('should not delete an alert belonging to another user', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.remove(otherUserId, alertId)).rejects.toThrow(
        new NotFoundException('Budget alert not found'),
      );

      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when alert does not exist', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.remove(userId, otherAlertId)).rejects.toThrow(
        new NotFoundException('Budget alert not found'),
      );

      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
