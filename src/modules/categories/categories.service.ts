import { ConflictException, Injectable } from '@nestjs/common';
import { CategoriesRepository } from './repositories/categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { GetCategoriesQueryDto } from './dto/get-categories-query.dto';

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
}
