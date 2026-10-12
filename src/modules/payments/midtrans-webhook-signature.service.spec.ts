import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';

import { MidtransWebhookSignatureService } from './midtrans-webhook-signature.service';

describe('MidtransWebhookSignatureService', () => {
  let service: MidtransWebhookSignatureService;

  const serverKey = 'sandbox-server-key-for-unit-tests';

  const configServiceMock = {
    get: jest.fn(),
  };

  const makeSignature = (
    orderId: string,
    statusCode: string,
    grossAmount: string,
  ): string =>
    createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`, 'utf8')
      .digest('hex');

  const makeNotification = () => {
    const orderId = 'payment-uuid-123';
    const statusCode = '200';
    const grossAmount = '99000.00';

    return {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: makeSignature(orderId, statusCode, grossAmount),
      transaction_status: 'settlement',
      currency: 'IDR',
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configServiceMock.get.mockReturnValue(serverKey);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MidtransWebhookSignatureService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get(MidtransWebhookSignatureService);
  });

  it('accepts a valid Midtrans signature', () => {
    const notification = makeNotification();

    const result = service.verify(notification);

    expect(result).toEqual({
      order_id: notification.order_id,
      status_code: notification.status_code,
      gross_amount: notification.gross_amount,
      signature_key: notification.signature_key,
    });
  });

  it('rejects a forged signature', () => {
    const notification = {
      ...makeNotification(),
      signature_key: 'a'.repeat(128),
    };

    expect(() => service.verify(notification)).toThrow(UnauthorizedException);
  });

  it('rejects a modified gross amount', () => {
    const notification = makeNotification();

    expect(() =>
      service.verify({
        ...notification,
        gross_amount: '1.00',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a payload that is not an object', () => {
    expect(() => service.verify(null)).toThrow(UnauthorizedException);
    expect(() => service.verify('invalid')).toThrow(UnauthorizedException);
    expect(() => service.verify([])).toThrow(UnauthorizedException);
  });

  it('rejects missing or malformed signature fields', () => {
    const notification = makeNotification();

    expect(() =>
      service.verify({
        ...notification,
        signature_key: undefined,
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.verify({
        ...notification,
        order_id: '',
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.verify({
        ...notification,
        gross_amount: 99000,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('fails closed when the Server Key is not configured', () => {
    configServiceMock.get.mockReturnValue(undefined);

    expect(() => service.verify(makeNotification())).toThrow(
      InternalServerErrorException,
    );
  });

  it('uses the original gross_amount string without reformatting', () => {
    const notification = makeNotification();

    const result = service.verify(notification);

    expect(result.gross_amount).toBe('99000.00');
  });
});
