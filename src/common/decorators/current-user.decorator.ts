import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user?: Record<string, unknown> }>();
  const user = request.user;
  if (!user) return undefined;
  return data ? user[data] : user;
});
