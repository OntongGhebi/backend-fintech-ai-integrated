/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CategoryType } from 'src/database/enums/category-type.enum';

import { CreateCategoryDto } from './dto/create-category.dto';
import { GetCategoriesQueryDto } from './dto/get-categories-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoriesRepository } from './repositories/categories.repository';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  private toCategoryType(value: string): CategoryType {
    switch (String(value)) {
      case 'INCOME':
        return CategoryType.INCOME;

      case 'EXPENSE':
        return CategoryType.EXPENSE;

      default:
        throw new BadRequestException('Invalid category type');
    }
  }

  private async validateParent(
    parentId: string | null | undefined,
    userId: string,
    type: CategoryType,
    currentCategoryId?: string,
  ) {
    if (!parentId) {
      return null;
    }

    if (parentId === currentCategoryId) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    const parent = await this.categoriesRepository.findByIdAndUserId(
      parentId,
      userId,
    );

    if (!parent) {
      throw new NotFoundException('Parent category not found');
    }

    if (!parent.isActive || parent.deletedAt) {
      throw new BadRequestException('Parent category is inactive');
    }

    if (String(parent.type) !== String(type)) {
      throw new BadRequestException(
        'Parent and child categories must have the same type',
      );
    }

    if (parent.parentId) {
      throw new BadRequestException(
        'Category hierarchy supports a maximum of two levels',
      );
    }

    return parent;
  }

  private async validateUniqueName(
    name: string,
    userId: string,
    type: CategoryType,
    parentId: string | null,
    currentCategoryId?: string,
  ) {
    const existingCategory = currentCategoryId
      ? await this.categoriesRepository.findByNameAndUserIdExceptId(
          name,
          userId,
          currentCategoryId,
          type,
          parentId,
        )
      : await this.categoriesRepository.findByNameAndUserId(
          name,
          userId,
          type,
          parentId,
        );

    if (existingCategory) {
      throw new ConflictException(
        'A category with this name already exists in this category group',
      );
    }
  }

  async create(userId: string, dto: CreateCategoryDto) {
    const name = dto.name.trim();
    const parentId = dto.parentId?.trim() || null;
    const type = this.toCategoryType(String(dto.type));

    await this.validateParent(parentId, userId, type);

    await this.validateUniqueName(name, userId, type, parentId);

    return this.categoriesRepository.create({
      userId,
      parentId,
      name,
      type,
      icon: dto.icon?.trim() || null,
      color: dto.color?.trim() || null,
      isSystem: false,
      isActive: true,
    });
  }

  async findAll(userId: string, query: GetCategoriesQueryDto) {
    if (query.type) {
      return this.categoriesRepository.findManyByUserIdAndType(
        userId,
        query.type,
      );
    }

    return this.categoriesRepository.findManyByUserId(userId);
  }

  async findById(categoryId: string, userId: string) {
    const category = await this.categoriesRepository.findByIdAndUserId(
      categoryId,
      userId,
    );

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(categoryId: string, userId: string, dto: UpdateCategoryDto) {
    const category = await this.categoriesRepository.findByIdAndUserId(
      categoryId,
      userId,
    );

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.isSystem) {
      throw new ForbiddenException('System categories cannot be updated');
    }

    const nextType = this.toCategoryType(String(dto.type ?? category.type));

    const nextParentId: string | null =
      dto.parentId !== undefined
        ? typeof dto.parentId === 'string'
          ? dto.parentId.trim() || null
          : null
        : category.parentId;

    if (nextParentId) {
      await this.validateParent(nextParentId, userId, nextType, categoryId);
    }

    const children = await this.categoriesRepository.findActiveChildren(
      categoryId,
      userId,
    );

    if (children.length > 0 && nextParentId) {
      throw new BadRequestException(
        'A category with children cannot become a child category',
      );
    }

    if (
      children.length > 0 &&
      dto.type !== undefined &&
      String(dto.type) !== String(category.type)
    ) {
      throw new BadRequestException(
        'Category type cannot change while it has active child categories',
      );
    }

    const updateData: {
      name?: string;
      type?: CategoryType;
      parentId?: string | null;
      icon?: string | null;
      color?: string | null;
    } = {};

    const nextName = dto.name !== undefined ? dto.name.trim() : category.name;

    if (
      dto.name !== undefined ||
      dto.type !== undefined ||
      dto.parentId !== undefined
    ) {
      await this.validateUniqueName(
        nextName,
        userId,
        nextType,
        nextParentId,
        categoryId,
      );
    }

    if (dto.name !== undefined) {
      updateData.name = nextName;
    }

    if (dto.type !== undefined) {
      updateData.type = nextType;
    }

    if (dto.parentId !== undefined) {
      updateData.parentId = nextParentId;
    }

    if (dto.icon !== undefined) {
      updateData.icon = dto.icon.trim() || null;
    }

    if (dto.color !== undefined) {
      updateData.color = dto.color.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return category;
    }

    const result = await this.categoriesRepository.update(
      categoryId,
      userId,
      updateData,
    );

    if (result.count === 0) {
      throw new NotFoundException('Category not found');
    }

    return this.categoriesRepository.findByIdAndUserId(categoryId, userId);
  }

  async archive(categoryId: string, userId: string) {
    const category = await this.categoriesRepository.findByIdAndUserId(
      categoryId,
      userId,
    );

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.isSystem) {
      throw new ForbiddenException('System categories cannot be archived');
    }

    const children = await this.categoriesRepository.findActiveChildren(
      categoryId,
      userId,
    );

    if (children.length > 0) {
      throw new BadRequestException(
        'A category with active subcategories cannot be archived',
      );
    }

    const result = await this.categoriesRepository.softDelete(
      categoryId,
      userId,
    );

    if (result.count === 0) {
      throw new NotFoundException('Category not found');
    }

    return {
      id: categoryId,
      archived: true,
    };
  }
}
