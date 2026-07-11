import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

function getParamDecoratorFactory(decorator: ParameterDecorator) {
  class Host {
    handler(@decorator _value: unknown) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Host, 'handler');
  return args[Object.keys(args)[0]].factory;
}

describe('CurrentUser', () => {
  it('returns full user when no property key', () => {
    const factory = getParamDecoratorFactory(CurrentUser());
    const user = { id: 'u1', email: 'a@b.com' };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as ExecutionContext;
    expect(factory(undefined, ctx)).toEqual(user);
  });

  it('returns user property when key provided', () => {
    const factory = getParamDecoratorFactory(CurrentUser('id'));
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }),
    } as ExecutionContext;
    expect(factory('id', ctx)).toBe('u1');
  });
});
