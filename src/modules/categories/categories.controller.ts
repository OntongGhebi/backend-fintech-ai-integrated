import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CategoriesService } from './categories.service';
import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { GetCategoriesQueryDto } from './dto/get-categories-query.dto';

@Controller('categories')
@ApiTags('Categories')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiCreatedResponse({
    description: 'Category created successfully',
  })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    const category = await this.categoriesService.create(userId, dto);

    return {
      data: category,
    };
  }

  @Get()
  @ApiOkResponse({
    description: 'Categories retrieved successfully',
    schema: {
      example: {
        data: [
          {
            id: '2d8c9a7d-1c25-4b6e-8d44-7a3d4c5e6f70',
            userId: '9a7b6c5d-4e3f-2a1b-8c7d-6e5f4a3b2c1d',
            name: 'Food',
            type: 'EXPENSE',
            icon: 'utensils',
            color: '#FF5733',
            isSystem: false,
            isActive: true,
            createdAt: '2026-09-16T00:00:00.000Z',
            updatedAt: '2026-09-16T00:00:00.000Z',
            deletedAt: null,
          },
        ],
      },
    },
  })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: GetCategoriesQueryDto,
  ) {
    const categories = await this.categoriesService.findAll(userId, query);

    return {
      data: categories,
    };
  }
}
