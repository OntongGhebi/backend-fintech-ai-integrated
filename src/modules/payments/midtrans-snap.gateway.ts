import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MidtransSnapCheckoutInput {
  orderId: string;
  grossAmount: number;
  itemId: string;
  itemName: string;
}

export interface MidtransSnapCheckoutResult {
  token: string;
  redirectUrl: string;
}

interface MidtransSnapTransactionResponse {
  token?: string;
  redirect_url?: string;
}

interface MidtransSnapClient {
  createTransaction(
    parameter: Record<string, unknown>,
  ): Promise<MidtransSnapTransactionResponse>;
}

interface MidtransClientModule {
  Snap: new (config: {
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }) => MidtransSnapClient;
}

@Injectable()
export class MidtransSnapGateway {
  private readonly logger = new Logger(MidtransSnapGateway.name);
  private snapClient?: MidtransSnapClient;

  constructor(private readonly configService: ConfigService) {}

  private getClient(): MidtransSnapClient {
    if (this.snapClient) {
      return this.snapClient;
    }

    if (this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true') {
      throw new InternalServerErrorException(
        'Production Midtrans is disabled for this implementation.',
      );
    }

    const serverKey = this.configService.get<string>('MIDTRANS_SERVER_KEY');
    const clientKey = this.configService.get<string>('MIDTRANS_CLIENT_KEY');

    if (!serverKey || !clientKey) {
      throw new ServiceUnavailableException(
        'Midtrans sandbox credentials are not configured.',
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const midtransClient = require('midtrans-client') as MidtransClientModule;

    this.snapClient = new midtransClient.Snap({
      isProduction: false,
      serverKey,
      clientKey,
    });

    return this.snapClient;
  }

  async createCheckout(
    input: MidtransSnapCheckoutInput,
  ): Promise<MidtransSnapCheckoutResult> {
    try {
      const result = await this.getClient().createTransaction({
        transaction_details: {
          order_id: input.orderId,
          gross_amount: input.grossAmount,
        },
        item_details: [
          {
            id: input.itemId,
            price: input.grossAmount,
            quantity: 1,
            name: input.itemName.slice(0, 50),
          },
        ],
      });

      if (!result.token || !result.redirect_url) {
        this.logger.error(
          'Midtrans returned an incomplete Snap checkout response.',
        );

        throw new ServiceUnavailableException(
          'Payment provider returned an invalid checkout response.',
        );
      }

      return {
        token: result.token,
        redirectUrl: result.redirect_url,
      };
    } catch (error: unknown) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      this.logger.error('Unable to create Midtrans Snap checkout.');

      throw new ServiceUnavailableException(
        'Unable to create payment checkout. Please try again later.',
      );
    }
  }
}
