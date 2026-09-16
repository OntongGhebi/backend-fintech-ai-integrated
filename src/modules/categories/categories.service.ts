import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesRepository } from './repositories/categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { GetCategoriesQueryDto } from './dto/get-categories-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async create(userId: string, dto: CreateCategoryDto) {
    const name = dto.name.trim();

    const existingCategory =
      await this.categoriesRepository.findByNameAndUserId(name, userId);

    if (existingCategory) {
      throw new ConflictException('A category with this name already exists');
    }

    return this.categoriesRepository.create({
      userId,
      name,
      type: dto.type,
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

    const updateData: {
      name?: string;
      type?: UpdateCategoryDto['type'];
      icon?: string | null;
      color?: string | null;
    } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      const existingCategory =
        await this.categoriesRepository.findByNameAndUserIdExceptId(
          name,
          userId,
          categoryId,
        );

      if (existingCategory) {
        throw new ConflictException('A category with this name already exists');
      }

      updateData.name = name;
    }

    if (dto.type !== undefined) {
      updateData.type = dto.type;
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
