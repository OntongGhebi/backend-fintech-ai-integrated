import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { CategoriesRepository } from './repositories/categories.repository';
import { CategoriesService } from './categories.service';
import { CategoryType } from 'src/database/enums/category-type.enum';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoriesRepository: jest.Mocked<CategoriesRepository>;

  beforeEach(() => {
    categoriesRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUserId: jest.fn(),
      findByNameAndUserId: jest.fn(),
      findByNameAndUserIdExceptId: jest.fn(),
      findManyByUserId: jest.fn(),
      findManyByUserIdAndType: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<CategoriesRepository>;

    service = new CategoriesService(categoriesRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a user category successfully', async () => {
      const userId = '11111111-1111-4111-8111-111111111111';

      const dto = {
        name: '  Food  ',
        type: CategoryType.EXPENSE,
        icon: '  utensils  ',
        color: '  #FF5733  ',
      };

      const createdCategory = {
        id: '22222222-2222-4222-8222-222222222222',
        userId,
        name: 'Food',
        type: CategoryType.EXPENSE,
        icon: 'utensils',
        color: '#FF5733',
        isSystem: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);

      categoriesRepository.create.mockResolvedValue(createdCategory as never);

      const result = await service.create(userId, dto);

      expect(categoriesRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Food',
        userId,
      );

      expect(categoriesRepository.create).toHaveBeenCalledWith({
        userId,
        name: 'Food',
        type: CategoryType.EXPENSE,
        icon: 'utensils',
        color: '#FF5733',
        isSystem: false,
        isActive: true,
      });

      expect(result).toEqual(createdCategory);
    });

    it('should trim category name before checking duplicate', async () => {
      const userId = '11111111-1111-4111-8111-111111111111';

      const dto = {
        name: '   Food   ',
        type: CategoryType.EXPENSE,
      };

      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);

      categoriesRepository.create.mockResolvedValue({} as never);

      await service.create(userId, dto);

      expect(categoriesRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Food',
        userId,
      );
    });

    it('should throw ConflictException when category name already exists', async () => {
      const userId = '11111111-1111-4111-8111-111111111111';

      const dto = {
        name: 'Food',
        type: CategoryType.EXPENSE,
      };

      categoriesRepository.findByNameAndUserId.mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
      } as never);

      await expect(service.create(userId, dto)).rejects.toThrow(
        ConflictException,
      );

      expect(categoriesRepository.create).not.toHaveBeenCalled();
    });

    it('should convert empty icon and color into null', async () => {
      const userId = '11111111-1111-4111-8111-111111111111';

      const dto = {
        name: 'Food',
        type: CategoryType.EXPENSE,
        icon: '   ',
        color: '   ',
      };

      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);

      categoriesRepository.create.mockResolvedValue({} as never);

      await service.create(userId, dto);

      expect(categoriesRepository.create).toHaveBeenCalledWith({
        userId,
        name: 'Food',
        type: CategoryType.EXPENSE,
        icon: null,
        color: null,
        isSystem: false,
        isActive: true,
      });
    });

    it('should always create user categories with isSystem false', async () => {
      const userId = '11111111-1111-4111-8111-111111111111';

      const dto = {
        name: 'Salary',
        type: CategoryType.INCOME,
      };

      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);

      categoriesRepository.create.mockResolvedValue({} as never);

      await service.create(userId, dto);

      expect(categoriesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isSystem: false,
          isActive: true,
        }),
      );
    });
  });

  describe('findAll', () => {
    const userId = '11111111-1111-4111-8111-111111111111';

    it('should return all active categories when no type filter is provided', async () => {
      const categories = [
        {
          id: '22222222-2222-4222-8222-222222222222',
          userId,
          name: 'Food',
          type: CategoryType.EXPENSE,
          isSystem: false,
          isActive: true,
          deletedAt: null,
        },
      ];

      categoriesRepository.findManyByUserId.mockResolvedValue(
        categories as never,
      );

      const result = await service.findAll(userId, {});

      expect(categoriesRepository.findManyByUserId).toHaveBeenCalledWith(
        userId,
      );

      expect(result).toEqual(categories);
    });

    it('should filter categories by type when type is provided', async () => {
      const categories = [
        {
          id: '22222222-2222-4222-8222-222222222222',
          userId,
          name: 'Salary',
          type: CategoryType.INCOME,
          isSystem: false,
          isActive: true,
          deletedAt: null,
        },
      ];

      categoriesRepository.findManyByUserIdAndType.mockResolvedValue(
        categories as never,
      );

      const result = await service.findAll(userId, {
        type: CategoryType.INCOME,
      });

      expect(categoriesRepository.findManyByUserIdAndType).toHaveBeenCalledWith(
        userId,
        CategoryType.INCOME,
      );

      expect(result).toEqual(categories);

      expect(categoriesRepository.findManyByUserId).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    const userId = '11111111-1111-4111-8111-111111111111';

    const categoryId = '22222222-2222-4222-8222-222222222222';

    it('should return an owned active category', async () => {
      const category = {
        id: categoryId,
        userId,
        name: 'Food',
        type: CategoryType.EXPENSE,
        isSystem: false,
        isActive: true,
        deletedAt: null,
      };

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        category as never,
      );

      const result = await service.findById(categoryId, userId);

      expect(categoriesRepository.findByIdAndUserId).toHaveBeenCalledWith(
        categoryId,
        userId,
      );

      expect(result).toEqual(category);
    });

    it('should throw NotFoundException when category does not belong to user', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(categoryId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when category is archived', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(categoryId, userId)).rejects.toThrow(
        'Category not found',
      );
    });
  });

  describe('update', () => {
    const userId = '11111111-1111-4111-8111-111111111111';

    const categoryId = '22222222-2222-4222-8222-222222222222';

    const existingCategory = {
      id: categoryId,
      userId,
      name: 'Food',
      type: CategoryType.EXPENSE,
      icon: 'utensils',
      color: '#FF5733',
      isSystem: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should update a user category successfully', async () => {
      const updatedCategory = {
        ...existingCategory,
        name: 'Groceries',
      };

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        existingCategory as never,
      );

      categoriesRepository.findByNameAndUserIdExceptId.mockResolvedValue(null);

      categoriesRepository.update.mockResolvedValue({
        count: 1,
      } as never);

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(existingCategory as never)
        .mockResolvedValueOnce(updatedCategory as never);

      const result = await service.update(categoryId, userId, {
        name: '  Groceries  ',
      });

      expect(
        categoriesRepository.findByNameAndUserIdExceptId,
      ).toHaveBeenCalledWith('Groceries', userId, categoryId);

      expect(categoriesRepository.update).toHaveBeenCalledWith(
        categoryId,
        userId,
        {
          name: 'Groceries',
        },
      );

      expect(result).toEqual(updatedCategory);
    });

    it('should update only provided fields', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        existingCategory as never,
      );

      categoriesRepository.update.mockResolvedValue({
        count: 1,
      } as never);

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(existingCategory as never)
        .mockResolvedValueOnce({
          ...existingCategory,
          icon: 'shopping-cart',
        } as never);

      await service.update(categoryId, userId, {
        icon: 'shopping-cart',
      });

      expect(categoriesRepository.update).toHaveBeenCalledWith(
        categoryId,
        userId,
        {
          icon: 'shopping-cart',
        },
      );
    });

    it('should convert empty icon and color to null', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        existingCategory as never,
      );

      categoriesRepository.update.mockResolvedValue({
        count: 1,
      } as never);

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(existingCategory as never)
        .mockResolvedValueOnce({
          ...existingCategory,
          icon: null,
          color: null,
        } as never);

      await service.update(categoryId, userId, {
        icon: '   ',
        color: '   ',
      });

      expect(categoriesRepository.update).toHaveBeenCalledWith(
        categoryId,
        userId,
        {
          icon: null,
          color: null,
        },
      );
    });

    it('should return the existing category when no fields are provided', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        existingCategory as never,
      );

      const result = await service.update(categoryId, userId, {});

      expect(result).toEqual(existingCategory);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when category does not exist', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.update(categoryId, userId, {
          name: 'Groceries',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when updating a system category', async () => {
      const systemCategory = {
        ...existingCategory,
        isSystem: true,
      };

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        systemCategory as never,
      );

      await expect(
        service.update(categoryId, userId, {
          name: 'Modified System Category',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when new name already exists', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        existingCategory as never,
      );

      categoriesRepository.findByNameAndUserIdExceptId.mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Groceries',
      } as never);

      await expect(
        service.update(categoryId, userId, {
          name: 'Groceries',
        }),
      ).rejects.toThrow(ConflictException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when update affects no rows', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        existingCategory as never,
      );

      categoriesRepository.update.mockResolvedValue({
        count: 0,
      } as never);

      await expect(
        service.update(categoryId, userId, {
          name: 'Groceries',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    const userId = '11111111-1111-4111-8111-111111111111';

    const categoryId = '22222222-2222-4222-8222-222222222222';

    const category = {
      id: categoryId,
      userId,
      name: 'Food',
      type: CategoryType.EXPENSE,
      isSystem: false,
      isActive: true,
      deletedAt: null,
    };

    it('should archive a user category successfully', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        category as never,
      );

      categoriesRepository.softDelete.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.archive(categoryId, userId);

      expect(categoriesRepository.softDelete).toHaveBeenCalledWith(
        categoryId,
        userId,
      );

      expect(result).toEqual({
        id: categoryId,
        archived: true,
      });
    });

    it('should throw NotFoundException when category does not exist', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.archive(categoryId, userId)).rejects.toThrow(
        NotFoundException,
      );

      expect(categoriesRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when archiving a system category', async () => {
      const systemCategory = {
        ...category,
        isSystem: true,
      };

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        systemCategory as never,
      );

      await expect(service.archive(categoryId, userId)).rejects.toThrow(
        ForbiddenException,
      );

      expect(categoriesRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when archive affects no rows', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        category as never,
      );

      categoriesRepository.softDelete.mockResolvedValue({
        count: 0,
      } as never);

      await expect(service.archive(categoryId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
