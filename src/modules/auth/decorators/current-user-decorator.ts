import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

export const currentUserFactory = (
  _data: unknown,
  context: ExecutionContext,
): string => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

  return request.user.id;
};

export const CurrentUser = createParamDecorator(currentUserFactory);
