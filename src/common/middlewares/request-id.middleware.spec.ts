import type { NextFunction, Response } from 'express';

import { RequestMiddleware, RequestWithId } from './request-id.middleware';

describe('RequestMiddleware', () => {
  let middleware: RequestMiddleware;
  let request: Partial<RequestWithId>;
  let response: {
    setHeader: jest.Mock;
  };
  let next: NextFunction;

  beforeEach(() => {
    middleware = new RequestMiddleware();

    request = {
      header: jest.fn(),
    };

    response = {
      setHeader: jest.fn(),
    };

    next = jest.fn();
  });

  it('should preserve a safe client request ID', () => {
    (request.header as jest.Mock).mockReturnValue('client-request-123');

    middleware.use(
      request as RequestWithId,
      response as unknown as Response,
      next,
    );

    expect(request.requestId).toBe('client-request-123');
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'client-request-123',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should generate a UUID when the client request ID contains a newline', () => {
    (request.header as jest.Mock).mockReturnValue(
      'request-id\nforged-log-entry',
    );

    middleware.use(
      request as RequestWithId,
      response as unknown as Response,
      next,
    );

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      request.requestId,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should generate a UUID when the client request ID is too long', () => {
    (request.header as jest.Mock).mockReturnValue('a'.repeat(65));

    middleware.use(
      request as RequestWithId,
      response as unknown as Response,
      next,
    );

    expect(request.requestId).not.toBe('a'.repeat(65));
    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('should generate a UUID when the client request ID is blank', () => {
    (request.header as jest.Mock).mockReturnValue('   ');

    middleware.use(
      request as RequestWithId,
      response as unknown as Response,
      next,
    );

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
