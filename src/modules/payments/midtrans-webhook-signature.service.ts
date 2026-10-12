import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';

export interface MidtransWebhookNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}

@Injectable()
export class MidtransWebhookSignatureService {
  constructor(private readonly configService: ConfigService) {}

  verify(notification: unknown): MidtransWebhookNotification {
    if (
      typeof notification !== 'object' ||
      notification === null ||
      Array.isArray(notification)
    ) {
      throw new UnauthorizedException('Invalid Midtrans notification payload.');
    }

    const payload = notification as Record<string, unknown>;

    const orderId = payload.order_id;
    const statusCode = payload.status_code;
    const grossAmount = payload.gross_amount;
    const signatureKey = payload.signature_key;

    if (
      typeof orderId !== 'string' ||
      orderId.length === 0 ||
      typeof statusCode !== 'string' ||
      statusCode.length === 0 ||
      typeof grossAmount !== 'string' ||
      grossAmount.length === 0 ||
      typeof signatureKey !== 'string' ||
      !/^[a-fA-F0-9]{128}$/.test(signatureKey)
    ) {
      throw new UnauthorizedException(
        'Midtrans notification is missing valid signature fields.',
      );
    }

    const serverKey = this.configService.get<string>('MIDTRANS_SERVER_KEY');

    if (!serverKey) {
      throw new InternalServerErrorException(
        'Midtrans Server Key is not configured.',
      );
    }

    // Midtrans specifies SHA512(order_id + status_code + gross_amount + ServerKey).
    // Keep grossAmount as the original string from the notification.
    const expectedSignature = createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`, 'utf8')
      .digest();

    const receivedSignature = Buffer.from(signatureKey, 'hex');

    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      throw new UnauthorizedException(
        'Invalid Midtrans notification signature.',
      );
    }

    return {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
    };
  }
}
