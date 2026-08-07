import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const user = request.user;
    if (field === undefined || user === undefined || user === null) {
      return user;
    }
    return (user as Record<string, unknown>)[field];
  },
);
