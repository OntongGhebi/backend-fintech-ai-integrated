import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';

@Controller('categories')
@ApiTags('Categories')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class CategoriesController {
  @Get()
  @ApiOkResponse({
    schema: {
      example: {
        data: [],
      },
    },
  })
  async findAll() {
    return {
      data: [],
    };
  }
}
