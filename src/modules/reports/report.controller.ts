import {
  Controller,
  Get,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { ReportService } from './report.service';

import { ReportQueryDto } from './dto/report-query.dto';

import {
  REPORT_EXPORT_CONTENT_TYPE,
  REPORT_EXPORT_FILENAME,
} from './report.constants';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('financial')
  @ApiOperation({
    summary: 'Get financial report',
    description:
      'Returns the financial report with aggregation data and paginated transaction details.',
  })
  async getFinancialReport(
    @CurrentUser('id') userId: string,
    @Query() query: ReportQueryDto,
  ) {
    const options = this.reportService.buildQueryOptions(query);

    return this.reportService.getFinancialReportDto(userId, options);
  }

  @Get('financial/export')
  @ApiOperation({
    summary: 'Export financial report as CSV',
    description:
      'Exports all matching financial transactions as CSV. Pagination parameters are ignored during export.',
  })
  @ApiProduces(REPORT_EXPORT_CONTENT_TYPE)
  async exportFinancialReport(
    @CurrentUser('id') userId: string,
    @Query() query: ReportQueryDto,
  ): Promise<StreamableFile> {
    const options = this.reportService.buildQueryOptions(query);

    const csv = await this.reportService.exportFinancialReportCsv(
      userId,
      options,
    );

    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: REPORT_EXPORT_CONTENT_TYPE,
      disposition: `attachment; filename="${REPORT_EXPORT_FILENAME}"`,
    });
  }
}
