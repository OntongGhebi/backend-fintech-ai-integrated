import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CategoriesService } from './categories.service';
import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { CreateCategoryDto } from './dto/create-category.dto';

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
}
