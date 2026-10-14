import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { BillingHistoryService } from './billing-history.service';
import { BillingHistoryQueryDto } from './dto/payment-history.dto';

import { CurrentUser } from '../auth/decorators/current-user-decorator';

@ApiTags('Billing History')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller()
export class BillingHistoryController {
  constructor(private readonly billingHistoryService: BillingHistoryService) {}

  @Get('subscriptions/history')
  @ApiOperation({
    summary: 'Get the authenticated user subscription event history',
  })
  getSubscriptionHistory(
    @CurrentUser('sub') userId: string,
    @Query() query: BillingHistoryQueryDto,
  ) {
    return this.billingHistoryService.getSubscriptionHistory(userId, query);
  }
}
