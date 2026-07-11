import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ClientContext } from './client-context.decorator';

function getParamDecoratorFactory(decorator: ParameterDecorator) {
  class Host {
    handler(@decorator _value: unknown) {
      void _value;
    }
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Host, 'handler');
  return args[Object.keys(args)[0]].factory;
}

describe('ClientContext', () => {
  it('extracts ip and userAgent from request', () => {
    const factory = getParamDecoratorFactory(ClientContext());
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '10.0.0.1',
          get: (h: string) => (h === 'user-agent' ? 'jest-agent' : undefined),
        }),
      }),
    } as ExecutionContext;
    expect(factory(undefined, ctx)).toEqual({ ip: '10.0.0.1', userAgent: 'jest-agent' });
  });

  it('falls back to socket.remoteAddress when ip is undefined', () => {
    const factory = getParamDecoratorFactory(ClientContext());
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: undefined,
          socket: { remoteAddress: '192.168.0.1' },
          get: () => 'jest-agent',
        }),
      }),
    } as ExecutionContext;
    expect(factory(undefined, ctx)).toEqual({ ip: '192.168.0.1', userAgent: 'jest-agent' });
  });

  it('returns undefined userAgent when header is missing', () => {
    const factory = getParamDecoratorFactory(ClientContext());
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '10.0.0.1',
          get: () => undefined,
        }),
      }),
    } as ExecutionContext;
    expect(factory(undefined, ctx)).toEqual({ ip: '10.0.0.1', userAgent: undefined });
  });
});
