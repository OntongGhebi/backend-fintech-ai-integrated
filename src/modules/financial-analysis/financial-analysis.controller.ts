import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { GetDashboardSummaryQueryDto } from '../dashboard/dto/get-dashboard-summary-query.dto';

import { FinancialAnalysisService } from './financial-analysis.service';

@Controller('financial-analysis')
@ApiTags('Financial Analysis')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class FinancialAnalysisController {
  constructor(
    private readonly financialAnalysisService: FinancialAnalysisService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get deterministic financial analysis overview',
    description:
      'Returns backend-calculated financial metrics, spending patterns, monthly trends, budget health, and financial signals.',
  })
  @ApiOkResponse({
    description: 'Financial analysis overview retrieved successfully.',
  })
  async getOverview(
    @CurrentUser('id') userId: string,
    @Query() query: GetDashboardSummaryQueryDto,
  ) {
    return this.financialAnalysisService.getOverview(userId, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }
}
