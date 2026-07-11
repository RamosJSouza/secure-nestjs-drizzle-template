import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface ClientContextData {
  ip?: string;
  userAgent?: string;
}

export const ClientContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): ClientContextData => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return {
    ip: req.ip ?? req.socket?.remoteAddress,
    userAgent: req.get('user-agent') ?? undefined,
  };
});
