import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { CategoryType } from 'src/database/enums/category-type.enum';
import { CategoriesRepository } from './repositories/categories.repository';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoriesRepository: jest.Mocked<CategoriesRepository>;

  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '99999999-9999-4999-8999-999999999999';

  const rootCategoryId = '22222222-2222-4222-8222-222222222222';
  const childCategoryId = '33333333-3333-4333-8333-333333333333';
  const otherCategoryId = '44444444-4444-4444-8444-444444444444';

  const createCategory = (overrides: Record<string, unknown> = {}) => ({
    id: rootCategoryId,
    userId,
    name: 'Food',
    type: CategoryType.EXPENSE,
    icon: 'utensils',
    color: '#FF5733',
    parentId: null,
    isSystem: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    parent: null,
    children: [],
    ...overrides,
  });

  beforeEach(() => {
    categoriesRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUserId: jest.fn(),
      findByNameAndUserId: jest.fn(),
      findByNameAndUserIdExceptId: jest.fn(),
      findActiveChildren: jest.fn(),
      findManyByUserId: jest.fn(),
      findManyByUserIdAndType: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<CategoriesRepository>;

    categoriesRepository.findActiveChildren.mockResolvedValue([] as never);

    service = new CategoriesService(categoriesRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a root category successfully', async () => {
      const dto = {
        name: '  Food  ',
        type: CategoryType.EXPENSE,
        icon: '  utensils  ',
        color: '  #FF5733  ',
      };

      const createdCategory = createCategory();

      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);
      categoriesRepository.create.mockResolvedValue(createdCategory as never);

      const result = await service.create(userId, dto);

      expect(categoriesRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Food',
        userId,
        CategoryType.EXPENSE,
        null,
      );

      expect(categoriesRepository.create).toHaveBeenCalledWith({
        userId,
        name: 'Food',
        type: CategoryType.EXPENSE,
        icon: 'utensils',
        color: '#FF5733',
        parentId: null,
        isSystem: false,
        isActive: true,
      });

      expect(result).toEqual(createdCategory);
    });

    it('should create a child category under a valid root category', async () => {
      const parent = createCategory();

      const child = createCategory({
        id: childCategoryId,
        name: 'Groceries',
        parentId: rootCategoryId,
        parent,
      });

      categoriesRepository.findByIdAndUserId.mockResolvedValue(parent as never);
      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);
      categoriesRepository.create.mockResolvedValue(child as never);

      const result = await service.create(userId, {
        name: 'Groceries',
        type: CategoryType.EXPENSE,
        parentId: rootCategoryId,
      });

      expect(categoriesRepository.findByIdAndUserId).toHaveBeenCalledWith(
        rootCategoryId,
        userId,
      );

      expect(categoriesRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Groceries',
        userId,
        CategoryType.EXPENSE,
        rootCategoryId,
      );

      expect(categoriesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          name: 'Groceries',
          type: CategoryType.EXPENSE,
          parentId: rootCategoryId,
          isSystem: false,
          isActive: true,
        }),
      );

      expect(result).toEqual(child);
    });

    it('should create a root category when parentId is explicitly null', async () => {
      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);
      categoriesRepository.create.mockResolvedValue(createCategory() as never);

      await service.create(userId, {
        name: 'Food',
        type: CategoryType.EXPENSE,
        parentId: null,
      });

      expect(categoriesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: null,
        }),
      );

      expect(categoriesRepository.findByIdAndUserId).not.toHaveBeenCalled();
    });

    it('should trim category name before checking duplicates', async () => {
      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);
      categoriesRepository.create.mockResolvedValue({} as never);

      await service.create(userId, {
        name: '   Food   ',
        type: CategoryType.EXPENSE,
      });

      expect(categoriesRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Food',
        userId,
        CategoryType.EXPENSE,
        null,
      );
    });

    it('should throw ConflictException when duplicate exists in the same scope', async () => {
      categoriesRepository.findByNameAndUserId.mockResolvedValue({
        id: otherCategoryId,
      } as never);

      await expect(
        service.create(userId, {
          name: 'Food',
          type: CategoryType.EXPENSE,
        }),
      ).rejects.toThrow(ConflictException);

      expect(categoriesRepository.create).not.toHaveBeenCalled();
    });

    it('should allow the same name under a different parent', async () => {
      const parent = createCategory({
        id: otherCategoryId,
        name: 'Transport',
      });

      categoriesRepository.findByIdAndUserId.mockResolvedValue(parent as never);
      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);
      categoriesRepository.create.mockResolvedValue({} as never);

      await service.create(userId, {
        name: 'Other',
        type: CategoryType.EXPENSE,
        parentId: otherCategoryId,
      });

      expect(categoriesRepository.findByNameAndUserId).toHaveBeenCalledWith(
        'Other',
        userId,
        CategoryType.EXPENSE,
        otherCategoryId,
      );

      expect(categoriesRepository.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when parent does not belong to the user', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.create(userId, {
          name: 'Groceries',
          type: CategoryType.EXPENSE,
          parentId: rootCategoryId,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(categoriesRepository.create).not.toHaveBeenCalled();
    });

    it('should reject an inactive parent category', async () => {
      const inactiveParent = createCategory({
        isActive: false,
      });

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        inactiveParent as never,
      );

      await expect(
        service.create(userId, {
          name: 'Groceries',
          type: CategoryType.EXPENSE,
          parentId: rootCategoryId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(categoriesRepository.create).not.toHaveBeenCalled();
    });

    it('should reject a parent with a different category type', async () => {
      const incomeParent = createCategory({
        type: CategoryType.INCOME,
      });

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        incomeParent as never,
      );

      await expect(
        service.create(userId, {
          name: 'Groceries',
          type: CategoryType.EXPENSE,
          parentId: rootCategoryId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(categoriesRepository.create).not.toHaveBeenCalled();
    });

    it('should reject a category whose parent is already a child', async () => {
      const childParent = createCategory({
        id: childCategoryId,
        parentId: rootCategoryId,
      });

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        childParent as never,
      );

      await expect(
        service.create(userId, {
          name: 'Subcategory',
          type: CategoryType.EXPENSE,
          parentId: childCategoryId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(categoriesRepository.create).not.toHaveBeenCalled();
    });

    it('should convert empty icon and color into null', async () => {
      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);
      categoriesRepository.create.mockResolvedValue({} as never);

      await service.create(userId, {
        name: 'Food',
        type: CategoryType.EXPENSE,
        icon: '   ',
        color: '   ',
      });

      expect(categoriesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: null,
          color: null,
        }),
      );
    });

    it('should always create user categories with isSystem false', async () => {
      categoriesRepository.findByNameAndUserId.mockResolvedValue(null);
      categoriesRepository.create.mockResolvedValue({} as never);

      await service.create(userId, {
        name: 'Salary',
        type: CategoryType.INCOME,
      });

      expect(categoriesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isSystem: false,
          isActive: true,
          parentId: null,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return all categories when no type filter is provided', async () => {
      const categories = [
        createCategory(),
        createCategory({
          id: childCategoryId,
          name: 'Groceries',
          parentId: rootCategoryId,
        }),
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
        createCategory({
          name: 'Salary',
          type: CategoryType.INCOME,
        }),
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
    it('should return an owned category', async () => {
      const category = createCategory();

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        category as never,
      );

      const result = await service.findById(rootCategoryId, userId);

      expect(categoriesRepository.findByIdAndUserId).toHaveBeenCalledWith(
        rootCategoryId,
        userId,
      );

      expect(result).toEqual(category);
    });

    it('should throw NotFoundException when category does not belong to user', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(rootCategoryId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when category is archived', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.findById(rootCategoryId, userId)).rejects.toThrow(
        'Category not found',
      );
    });
  });

  describe('update', () => {
    it('should update a category name successfully', async () => {
      const existingCategory = createCategory();
      const updatedCategory = {
        ...existingCategory,
        name: 'Groceries',
      };

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(existingCategory as never)
        .mockResolvedValueOnce(updatedCategory as never);

      categoriesRepository.findByNameAndUserIdExceptId.mockResolvedValue(null);
      categoriesRepository.update.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.update(rootCategoryId, userId, {
        name: '  Groceries  ',
      });

      expect(
        categoriesRepository.findByNameAndUserIdExceptId,
      ).toHaveBeenCalledWith(
        'Groceries',
        userId,
        rootCategoryId,
        CategoryType.EXPENSE,
        null,
      );

      expect(categoriesRepository.update).toHaveBeenCalledWith(
        rootCategoryId,
        userId,
        {
          name: 'Groceries',
        },
      );

      expect(result).toEqual(updatedCategory);
    });

    it('should update only provided fields', async () => {
      const existingCategory = createCategory();

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(existingCategory as never)
        .mockResolvedValueOnce({
          ...existingCategory,
          icon: 'shopping-cart',
        } as never);

      categoriesRepository.update.mockResolvedValue({
        count: 1,
      } as never);

      await service.update(rootCategoryId, userId, {
        icon: 'shopping-cart',
      });

      expect(categoriesRepository.update).toHaveBeenCalledWith(
        rootCategoryId,
        userId,
        {
          icon: 'shopping-cart',
        },
      );
    });

    it('should convert empty icon and color into null', async () => {
      const existingCategory = createCategory();

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(existingCategory as never)
        .mockResolvedValueOnce({
          ...existingCategory,
          icon: null,
          color: null,
        } as never);

      categoriesRepository.update.mockResolvedValue({
        count: 1,
      } as never);

      await service.update(rootCategoryId, userId, {
        icon: '   ',
        color: '   ',
      });

      expect(categoriesRepository.update).toHaveBeenCalledWith(
        rootCategoryId,
        userId,
        {
          icon: null,
          color: null,
        },
      );
    });

    it('should return existing category when no fields are provided', async () => {
      const existingCategory = createCategory();

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        existingCategory as never,
      );

      const result = await service.update(rootCategoryId, userId, {});

      expect(result).toEqual(existingCategory);
      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when category does not exist', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.update(rootCategoryId, userId, {
          name: 'Groceries',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when updating a system category', async () => {
      const systemCategory = createCategory({
        isSystem: true,
      });

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        systemCategory as never,
      );

      await expect(
        service.update(rootCategoryId, userId, {
          name: 'Modified System Category',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when duplicate name exists in target scope', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        createCategory() as never,
      );

      categoriesRepository.findByNameAndUserIdExceptId.mockResolvedValue({
        id: otherCategoryId,
        name: 'Groceries',
      } as never);

      await expect(
        service.update(rootCategoryId, userId, {
          name: 'Groceries',
        }),
      ).rejects.toThrow(ConflictException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should allow moving a child category back to root', async () => {
      const child = createCategory({
        id: childCategoryId,
        name: 'Groceries',
        parentId: rootCategoryId,
      });

      const updatedChild = {
        ...child,
        parentId: null,
      };

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(child as never)
        .mockResolvedValueOnce(updatedChild as never);

      categoriesRepository.findByNameAndUserIdExceptId.mockResolvedValue(null);
      categoriesRepository.update.mockResolvedValue({
        count: 1,
      } as never);

      await service.update(childCategoryId, userId, {
        parentId: null,
      });

      expect(
        categoriesRepository.findByNameAndUserIdExceptId,
      ).toHaveBeenCalledWith(
        'Groceries',
        userId,
        childCategoryId,
        CategoryType.EXPENSE,
        null,
      );

      expect(categoriesRepository.update).toHaveBeenCalledWith(
        childCategoryId,
        userId,
        {
          parentId: null,
        },
      );
    });

    it('should reject assigning a category as its own parent', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        createCategory() as never,
      );

      await expect(
        service.update(rootCategoryId, userId, {
          parentId: rootCategoryId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should reject moving a category under a parent owned by another user', async () => {
      const existingCategory = createCategory();
      const foreignParent = createCategory({
        id: otherCategoryId,
        userId: otherUserId,
      });

      // The service may resolve the parent through either an ownership-scoped
      // lookup or a direct lookup followed by an owner check. Mock both paths
      // so this test verifies the same ownership rule without leaking a
      // foreign category into the update operation.
      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(existingCategory as never)
        .mockResolvedValueOnce(null);

      categoriesRepository.findById.mockResolvedValue(foreignParent as never);

      await expect(
        service.update(rootCategoryId, userId, {
          parentId: otherCategoryId,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should reject moving a category under a parent with a different type', async () => {
      const existingCategory = createCategory();
      const incomeParent = createCategory({
        id: otherCategoryId,
        type: CategoryType.INCOME,
      });

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(existingCategory as never)
        .mockResolvedValueOnce(incomeParent as never);

      await expect(
        service.update(rootCategoryId, userId, {
          parentId: otherCategoryId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should reject moving a category under another child category', async () => {
      const existingCategory = createCategory();
      const childParent = createCategory({
        id: childCategoryId,
        parentId: otherCategoryId,
      });

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(existingCategory as never)
        .mockResolvedValueOnce(childParent as never);

      await expect(
        service.update(rootCategoryId, userId, {
          parentId: childCategoryId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should reject changing parent category type while it has active children', async () => {
      const parentWithChildren = createCategory({
        children: [
          createCategory({
            id: childCategoryId,
            parentId: rootCategoryId,
          }),
        ],
      });

      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        parentWithChildren as never,
      );
      categoriesRepository.findActiveChildren.mockResolvedValue([
        createCategory({
          id: childCategoryId,
          parentId: rootCategoryId,
        }),
      ] as never);

      await expect(
        service.update(rootCategoryId, userId, {
          type: CategoryType.INCOME,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should reject converting a parent category into a child while it has active children', async () => {
      const parentWithChildren = createCategory({
        children: [
          createCategory({
            id: childCategoryId,
            parentId: rootCategoryId,
          }),
        ],
      });

      const newParent = createCategory({
        id: otherCategoryId,
      });

      categoriesRepository.findByIdAndUserId
        .mockResolvedValueOnce(parentWithChildren as never)
        .mockResolvedValueOnce(newParent as never);

      categoriesRepository.findActiveChildren.mockResolvedValue([
        createCategory({
          id: childCategoryId,
          parentId: rootCategoryId,
        }),
      ] as never);

      await expect(
        service.update(rootCategoryId, userId, {
          parentId: otherCategoryId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when update affects no rows', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        createCategory() as never,
      );
      categoriesRepository.findByNameAndUserIdExceptId.mockResolvedValue(null);
      categoriesRepository.update.mockResolvedValue({
        count: 0,
      } as never);

      await expect(
        service.update(rootCategoryId, userId, {
          name: 'Groceries',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    it('should archive a category without active children', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        createCategory() as never,
      );
      categoriesRepository.findActiveChildren.mockResolvedValue([] as never);
      categoriesRepository.softDelete.mockResolvedValue({
        count: 1,
      } as never);

      const result = await service.archive(rootCategoryId, userId);

      expect(categoriesRepository.findActiveChildren).toHaveBeenCalledWith(
        rootCategoryId,
        userId,
      );

      expect(categoriesRepository.softDelete).toHaveBeenCalledWith(
        rootCategoryId,
        userId,
      );

      expect(result).toEqual({
        id: rootCategoryId,
        archived: true,
      });
    });

    it('should reject archiving a parent category with active children', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        createCategory() as never,
      );
      categoriesRepository.findActiveChildren.mockResolvedValue([
        createCategory({
          id: childCategoryId,
          parentId: rootCategoryId,
        }),
      ] as never);

      await expect(service.archive(rootCategoryId, userId)).rejects.toThrow(
        BadRequestException,
      );

      expect(categoriesRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when category does not exist', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.archive(rootCategoryId, userId)).rejects.toThrow(
        NotFoundException,
      );

      expect(categoriesRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when archiving a system category', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        createCategory({
          isSystem: true,
        }) as never,
      );

      await expect(service.archive(rootCategoryId, userId)).rejects.toThrow(
        ForbiddenException,
      );

      expect(categoriesRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when archive affects no rows', async () => {
      categoriesRepository.findByIdAndUserId.mockResolvedValue(
        createCategory() as never,
      );
      categoriesRepository.findActiveChildren.mockResolvedValue([] as never);
      categoriesRepository.softDelete.mockResolvedValue({
        count: 0,
      } as never);

      await expect(service.archive(rootCategoryId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
