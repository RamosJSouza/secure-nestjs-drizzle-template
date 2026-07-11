import { TOKEN_TYPE, TOKEN_ISSUER, TOKEN_AUDIENCE } from './token-types';

describe('token-types', () => {
  it('exposes access and refresh types', () => {
    expect(TOKEN_TYPE.ACCESS).toBe('access');
    expect(TOKEN_TYPE.REFRESH).toBe('refresh');
  });

  it('exposes issuer and audience', () => {
    expect(TOKEN_ISSUER).toBeTruthy();
    expect(TOKEN_AUDIENCE).toBeTruthy();
    expect(TOKEN_ISSUER).not.toEqual(TOKEN_AUDIENCE);
  });
});
