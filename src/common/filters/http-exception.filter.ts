import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import type { RequestWithId } from '../middlewares/request-id.middleware';

interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  requestId: string;
  timestamp: string;
}

interface SafeExceptionResponse {
  message?: unknown;
  error?: unknown;
}

const INTERNAL_ERROR_MESSAGE = 'Internal server error';
const INTERNAL_ERROR_NAME = 'Internal Server Error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    if (response.headersSent) {
      return;
    }

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse = isHttpException
      ? this.buildHttpErrorResponse(exception, statusCode, request)
      : this.buildInternalErrorResponse(request);

    this.logException(exception, errorResponse, request, isHttpException);

    response.status(statusCode).json(errorResponse);
  }

  private buildHttpErrorResponse(
    exception: HttpException,
    statusCode: number,
    request: RequestWithId,
  ): ErrorResponse {
    if (this.isServerError(statusCode)) {
      return this.buildInternalErrorResponse(request, statusCode);
    }

    const exceptionResponse: unknown = exception.getResponse();

    let message: string | string[] = 'An error occurred';
    let error = this.getHttpStatusName(statusCode);

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const safeResponse = exceptionResponse as SafeExceptionResponse;

      if (this.isSafeMessage(safeResponse.message)) {
        message = safeResponse.message;
      }

      if (typeof safeResponse.error === 'string') {
        error = safeResponse.error;
      }
    }

    return this.createErrorResponse(statusCode, message, error, request);
  }

  private buildInternalErrorResponse(
    request: RequestWithId,
    statusCode = HttpStatus.INTERNAL_SERVER_ERROR,
  ): ErrorResponse {
    return this.createErrorResponse(
      statusCode,
      INTERNAL_ERROR_MESSAGE,
      INTERNAL_ERROR_NAME,
      request,
    );
  }

  private createErrorResponse(
    statusCode: number,
    message: string | string[],
    error: string,
    request: RequestWithId,
  ): ErrorResponse {
    return {
      success: false,
      statusCode,
      message,
      error,
      path: request.path || request.url || '/',
      requestId: request.requestId || 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  private isServerError(statusCode: number): boolean {
    return statusCode >= HttpStatus.INTERNAL_SERVER_ERROR && statusCode < 600;
  }

  private getHttpStatusName(statusCode: number): string {
    const statusName = HttpStatus[statusCode];

    return statusName
      ? statusName
          .split('_')
          .map((word) => word[0] + word.slice(1).toLowerCase())
          .join(' ')
      : 'Error';
  }

  private isSafeMessage(value: unknown): value is string | string[] {
    if (typeof value === 'string') {
      return true;
    }

    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item: unknown) => typeof item === 'string')
    );
  }

  private logException(
    exception: unknown,
    errorResponse: ErrorResponse,
    request: RequestWithId,
    isHttpException: boolean,
  ): void {
    const requestId = request.requestId || 'unknown';
    const method = request.method || 'UNKNOWN';
    const path = request.path || '/';

    if (isHttpException) {
      const message = Array.isArray(errorResponse.message)
        ? errorResponse.message.join('; ')
        : errorResponse.message;

      const logMessage =
        `[${requestId}] ${method} ${path} ` +
        `${errorResponse.statusCode} - ${message}`;

      if (this.isServerError(errorResponse.statusCode)) {
        this.logger.error(logMessage, this.getStack(exception));
      } else {
        this.logger.warn(logMessage);
      }

      return;
    }

    const logMessage =
      `[${requestId}] ${method} ${path} ` +
      `${HttpStatus.INTERNAL_SERVER_ERROR} - Unexpected internal error`;

    this.logger.error(logMessage, this.getStack(exception));
  }

  private getStack(exception: unknown): string | undefined {
    if (exception instanceof Error) {
      return exception.stack;
    }

    return undefined;
  }
}
