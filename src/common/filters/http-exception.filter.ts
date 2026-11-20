import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

import { RequestWithId } from '../middlewares/request-id.middleware';

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
  message?: string | string[];
  error?: string;
}

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
    const exceptionResponse = exception.getResponse();

    let message: string | string[] = 'An error occurred';
    let error = HttpStatus[statusCode] ?? 'Error';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const safeResponse = exceptionResponse as SafeExceptionResponse;

      if (safeResponse.message) {
        message = safeResponse.message;
      }

      if (safeResponse.error) {
        error = safeResponse.error;
      }
    }

    return this.createErrorResponse(statusCode, message, error, request);
  }

  private buildInternalErrorResponse(request: RequestWithId): ErrorResponse {
    return this.createErrorResponse(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Internal server error',
      'Internal Server Error',
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

      if (
        errorResponse.statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)
      ) {
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
