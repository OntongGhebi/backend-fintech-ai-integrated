import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { StartTrialDto } from './dto/start-trial.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get the current user subscription',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiNotFoundResponse({
    description: 'The user does not have a current subscription',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async getCurrent(
    @CurrentUser() userId: string,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.getCurrent(userId);
  }

  @Post('trial')
  @ApiOperation({
    summary: 'Start a trial for an active plan',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiNotFoundResponse({ description: 'Active plan not found' })
  @ApiConflictResponse({
    description: 'An active subscription exists or the trial was already used',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async startTrial(
    @CurrentUser() userId: string,
    @Body() dto: StartTrialDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.startTrial(userId, dto.planCode);
  }

  @Patch('me/cancel')
  @ApiOperation({
    summary: 'Cancel a trial or schedule subscription cancellation',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiNotFoundResponse({ description: 'Current subscription not found' })
  @ApiConflictResponse({
    description: 'Subscription cannot be cancelled in its current state',
  })
  async cancelCurrent(
    @CurrentUser() userId: string,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.cancelCurrent(userId);
  }

  @Patch('me/resume')
  @ApiOperation({
    summary: 'Resume a subscription scheduled for cancellation',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiNotFoundResponse({ description: 'Current subscription not found' })
  @ApiConflictResponse({
    description: 'Subscription is not scheduled for cancellation',
  })
  async resumeCurrent(
    @CurrentUser() userId: string,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.resumeCurrent(userId);
  }
}
