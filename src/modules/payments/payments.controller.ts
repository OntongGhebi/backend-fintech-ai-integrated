import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { GetPaymentsQueryDto } from './dto/get-payments-query.dto';
import { PaymentListResponseDto } from './dto/payment-list-response.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get the authenticated user payment history',
  })
  @ApiOkResponse({ type: PaymentListResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false })
  async findMine(
    @CurrentUser() userId: string,
    @Query() query: GetPaymentsQueryDto,
  ): Promise<PaymentListResponseDto> {
    return this.paymentsService.findManyByUserId(userId, query);
  }

  @Get(':paymentId')
  @ApiOperation({
    summary: 'Get a payment owned by the authenticated user',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({
    description: 'Payment does not exist or does not belong to the user',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  async findById(
    @CurrentUser() userId: string,
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.findById(paymentId, userId);
  }
}
