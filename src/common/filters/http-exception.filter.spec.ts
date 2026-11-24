import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import type { RequestWithId } from '../middlewares/request-id.middleware';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let response: {
    headersSent: boolean;
    status: jest.Mock;
    json: jest.Mock;
  };
  let request: Partial<RequestWithId>;
  let host: ArgumentsHost;

  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    response = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    request = {
      requestId: 'request-test-123',
      method: 'GET',
      path: '/api/v1/test',
      url: '/api/v1/test?secret=should-not-leak',
    };

    host = {
      switchToHttp: () => ({
        getResponse: () => response as unknown as Response,
        getRequest: () => request as RequestWithId,
      }),
    } as ArgumentsHost;

    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HTTP exceptions', () => {
    it('preserves the status and message of a BadRequestException', () => {
      filter.catch(new BadRequestException('Invalid request'), host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid request',
          error: 'Bad Request',
          path: '/api/v1/test',
          requestId: 'request-test-123',
          timestamp: expect.any(String),
        }),
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('preserves validation message arrays', () => {
      const exception = new HttpException(
        {
          message: ['email must be an email', 'password should not be empty'],
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, host);

      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['email must be an email', 'password should not be empty'],
        }),
      );
    });

    it('uses a safe fallback for malformed exception messages', () => {
      const exception = new HttpException(
        {
          message: {
            internal: 'sensitive implementation detail',
          },
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, host);

      const responseBody = response.json.mock.calls[0][0];

      expect(responseBody.message).toBe('An error occurred');
      expect(JSON.stringify(responseBody)).not.toContain(
        'sensitive implementation detail',
      );
    });

    it('does not expose non-string error metadata', () => {
      const exception = new HttpException(
        {
          message: 'Invalid input',
          error: {
            internal: 'sensitive implementation detail',
          },
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, host);

      const responseBody = response.json.mock.calls[0][0];

      expect(responseBody.message).toBe('Invalid input');
      expect(responseBody.error).toBe('Bad Request');
      expect(JSON.stringify(responseBody)).not.toContain(
        'sensitive implementation detail',
      );
    });

    it('sanitizes internal server error messages', () => {
      const sensitiveMessage =
        'Database connection failed: postgres://user:password@host';

      filter.catch(
        new HttpException(sensitiveMessage, HttpStatus.INTERNAL_SERVER_ERROR),
        host,
      );

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      const responseBody = response.json.mock.calls[0][0];

      expect(responseBody).toEqual(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'Internal Server Error',
        }),
      );

      expect(JSON.stringify(responseBody)).not.toContain(
        'Database connection failed',
      );
      expect(JSON.stringify(responseBody)).not.toContain('password');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('sanitizes ServiceUnavailableException messages', () => {
      const exception = new HttpException(
        'Upstream provider secret response',
        HttpStatus.SERVICE_UNAVAILABLE,
      );

      filter.catch(exception, host);

      const responseBody = response.json.mock.calls[0][0];

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(responseBody.message).toBe('Internal server error');
      expect(responseBody.error).toBe('Internal Server Error');
      expect(JSON.stringify(responseBody)).not.toContain(
        'Upstream provider secret response',
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('unexpected exceptions', () => {
    it('returns a sanitized 500 response for an Error', () => {
      const exception = new Error(
        'Database connection failed: postgres://user:password@host',
      );

      filter.catch(exception, host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'Internal Server Error',
          path: '/api/v1/test',
          requestId: 'request-test-123',
          timestamp: expect.any(String),
        }),
      );

      const responseBody = response.json.mock.calls[0][0];

      expect(JSON.stringify(responseBody)).not.toContain(
        'Database connection failed',
      );
      expect(JSON.stringify(responseBody)).not.toContain('password');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected internal error'),
        expect.any(String),
      );
    });

    it('sanitizes non-Error thrown values', () => {
      filter.catch('Sensitive internal implementation detail', host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Internal server error',
          error: 'Internal Server Error',
        }),
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('request metadata', () => {
    it('uses fallback values when request metadata is missing', () => {
      request = {};

      filter.catch(new Error('Unexpected error'), host);

      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/',
          requestId: 'unknown',
        }),
      );
    });

    it('does not expose query string values in the error path', () => {
      filter.catch(new BadRequestException('Invalid input'), host);

      const responseBody = response.json.mock.calls[0][0];

      expect(responseBody.path).toBe('/api/v1/test');
      expect(responseBody.path).not.toContain('secret');
    });
  });

  describe('response state', () => {
    it('does not write a response when headers have already been sent', () => {
      response.headersSent = true;

      filter.catch(new Error('Unexpected error'), host);

      expect(response.status).not.toHaveBeenCalled();
      expect(response.json).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
