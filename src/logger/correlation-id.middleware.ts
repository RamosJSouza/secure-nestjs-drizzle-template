import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { RequestContext } from './request-context';

// Express 5 type augmentation requires the global Express namespace declaration.
// The preferred `declare module 'express-serve-static-core'` form is blocked under
// pnpm strict isolation (@types/express-serve-static-core is only a transitive dep,
// not symlinked into node_modules/@types/), so TS cannot resolve that bare specifier.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

// UUID v4 format — rejects injected payloads, logs only controlled identifiers
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-correlation-id'] as string | undefined;
    const correlationId =
      incoming && UUID_V4_RE.test(incoming) ? incoming : randomUUID();
    req.correlationId = correlationId;
    (req as any).id = correlationId;

    res.setHeader('X-Correlation-Id', correlationId);

    RequestContext.run({ correlationId }, () => {
      next();
    });
  }
}
