import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends Request {
  requestId: string;
}

@Injectable()
export class RequestMiddleware implements NestMiddleware {
  use(request: RequestWithId, reponse: Response, next: NextFunction): void {
    const incomingRequestId = request.header(REQUEST_ID_HEADER);
    const requestId = incomingRequestId?.trim() || randomUUID();
    request.requestId = requestId;
    reponse.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
