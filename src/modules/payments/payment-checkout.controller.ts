import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { CreatePaymentCheckoutDto } from './dto/payment-checkout.dto';
import {
  PaymentCheckoutResponse,
  PaymentCheckoutService,
} from './payment-checkout.service';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(AccessTokenGuard)
export class PaymentCheckoutController {
  constructor(
    private readonly paymentCheckoutService: PaymentCheckoutService,
  ) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a Midtrans Snap checkout for a subscription',
  })
  @ApiCreatedResponse({
    description: 'Payment record and Midtrans Snap checkout information.',
  })
  async createCheckout(
    @CurrentUser() userId: string,
    @Body() dto: CreatePaymentCheckoutDto,
  ): Promise<PaymentCheckoutResponse> {
    return this.paymentCheckoutService.createCheckout(
      userId,
      dto.subscriptionId,
    );
  }
}
