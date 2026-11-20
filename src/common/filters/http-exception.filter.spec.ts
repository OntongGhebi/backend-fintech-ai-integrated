import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

import { HttpExceptionFilter } from './http-exception.filter';
import { RequestWithId } from '../middlewares/request-id.middleware';

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
    it('should preserve the status and message of a BadRequestException', () => {
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

    it('should preserve validation message arrays', () => {
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

    it('should log HTTP 5xx exceptions as errors', () => {
      filter.catch(
        new HttpException(
          'Service unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
        host,
      );

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('unexpected exceptions', () => {
    it('should return a sanitized 500 response for an Error', () => {
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

    it('should sanitize non-Error thrown values', () => {
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
    it('should use fallback values when request metadata is missing', () => {
      request = {};

      filter.catch(new Error('Unexpected error'), host);

      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/',
          requestId: 'unknown',
        }),
      );
    });

    it('should not expose query string values in the error path', () => {
      filter.catch(new BadRequestException('Invalid input'), host);

      const responseBody = response.json.mock.calls[0][0];

      expect(responseBody.path).toBe('/api/v1/test');
      expect(responseBody.path).not.toContain('secret');
    });
  });

  describe('response state', () => {
    it('should not write a response when headers have already been sent', () => {
      response.headersSent = true;

      filter.catch(new Error('Unexpected error'), host);

      expect(response.status).not.toHaveBeenCalled();
      expect(response.json).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
