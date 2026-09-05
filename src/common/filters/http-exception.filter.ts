import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
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

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const errorResponse = this.buildErrorResponse(
      exceptionResponse,
      statusCode,
      request,
    );

    this.logger.warn(
      `[${request.requestId}] ${request.method} ${request.originalUrl} ${statusCode}`,
    );

    response.status(statusCode).json(errorResponse);
  }

  private buildErrorResponse(
    exceptionResponse: string | object,
    statusCode: number,
    request: RequestWithId,
  ): ErrorResponse {
    let message: string | string[] = 'An error occurred';
    let error = HttpStatus[statusCode] ?? 'Error';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const response = exceptionResponse as {
        message?: string | string[];
        error?: string;
      };

      if (response.message) {
        message = response.message;
      }
      if (response.error) {
        error = response.error;
      }
    }

    return {
      success: false,
      statusCode,
      message,
      error,
      path: request.url,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    };
  }
}
