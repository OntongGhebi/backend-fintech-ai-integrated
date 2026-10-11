import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { PlansService } from './plans.service';
import { PlanResponseDto } from './dto/plan-response.dto';

@ApiTags('Plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({
    summary: 'Get active subscription plans',
  })
  @ApiOkResponse({
    description: 'Active plans retrieved successfully',
    type: PlanResponseDto,
    isArray: true,
  })
  async findAll(): Promise<{ data: PlanResponseDto[] }> {
    return {
      data: await this.plansService.findAllActive(),
    };
  }

  @Get(':code')
  @ApiOperation({
    summary: 'Get an active subscription plan by code',
  })
  @ApiOkResponse({
    description: 'Plan retrieved successfully',
    type: PlanResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Plan not found or inactive',
  })
  async findByCode(
    @Param('code') code: string,
  ): Promise<{ data: PlanResponseDto }> {
    return {
      data: await this.plansService.findActiveByCode(code),
    };
  }
}
