import { ExecutionContext } from '@nestjs/common';

import { currentUserFactory } from './current-user-decorator';

describe('CurrentUser', () => {
  it('should return authenticated user id', () => {
    const request = {
      user: {
        id: 'user-123',
      },
    };

    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
    } as unknown as ExecutionContext;

    const result = currentUserFactory(undefined, context);

    expect(result).toBe('user-123');
  });
});
