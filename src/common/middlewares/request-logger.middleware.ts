import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { RequestWithId } from './request-id.middleware';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const startTime = Date.now();

    response.on('finish', () => {
      const duration = Date.now() - startTime;
      const requestId = request.requestId;
      const method = request.method;
      const path = request.path;
      const statusCode = response.statusCode;

      const message = [
        `[${requestId}]`,
        `${method} ${path}`,
        `${statusCode}`,
        `${duration}ms`,
      ].join(' ');

      if (statusCode >= 500) {
        this.logger.warn(message);
        return;
      }

      this.logger.log(message);
    });

    next();
  }
}
