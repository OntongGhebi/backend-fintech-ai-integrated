import type { NextFunction, Response } from 'express';

import { RequestLoggerMiddleware } from './request-logger.middleware';
import { RequestWithId } from './request-id.middleware';

describe('RequestLoggerMiddleware', () => {
  let middleware: RequestLoggerMiddleware;
  let request: Partial<RequestWithId>;
  let response: {
    on: jest.Mock;
    statusCode: number;
  };
  let next: NextFunction;
  let finishCallback: (() => void) | undefined;

  beforeEach(() => {
    middleware = new RequestLoggerMiddleware();

    request = {
      requestId: 'safe-request-id',
      method: 'GET',
      path: '/api/v1/auth/verify-email',
      originalUrl: '/api/v1/auth/verify-email?token=super-secret-token',
    };

    finishCallback = undefined;

    response = {
      statusCode: 200,
      on: jest.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          finishCallback = callback;
        }

        return response;
      }),
    };

    next = jest.fn();
  });

  it('should log the path without query parameters', () => {
    const logSpy = jest
      .spyOn((middleware as any).logger, 'log')
      .mockImplementation();

    middleware.use(
      request as RequestWithId,
      response as unknown as Response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(finishCallback).toBeDefined();

    finishCallback?.();

    expect(logSpy).toHaveBeenCalledTimes(1);

    const loggedMessage = logSpy.mock.calls[0][0] as string;

    expect(loggedMessage).toContain('GET /api/v1/auth/verify-email');
    expect(loggedMessage).not.toContain('super-secret-token');
    expect(loggedMessage).not.toContain('?token=');
  });

  it('should log server errors as warnings', () => {
    const warnSpy = jest
      .spyOn((middleware as any).logger, 'warn')
      .mockImplementation();

    response.statusCode = 500;

    middleware.use(
      request as RequestWithId,
      response as unknown as Response,
      next,
    );

    finishCallback?.();

    expect(warnSpy).toHaveBeenCalledTimes(1);

    const loggedMessage = warnSpy.mock.calls[0][0] as string;

    expect(loggedMessage).toContain('500');
    expect(loggedMessage).not.toContain('super-secret-token');
  });
});
