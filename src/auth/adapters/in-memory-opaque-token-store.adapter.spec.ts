import { InMemoryOpaqueTokenStoreAdapter } from './in-memory-opaque-token-store.adapter';
import { OpaqueTokenPurpose } from '../ports/opaque-token-store.port';

describe('InMemoryOpaqueTokenStoreAdapter', () => {
  it('consumes token once then returns null on replay', async () => {
    const store = new InMemoryOpaqueTokenStoreAdapter();
    await store.store(OpaqueTokenPurpose.PASSWORD_RESET, 'hash1', 'user-1', 60);
    await expect(store.consume(OpaqueTokenPurpose.PASSWORD_RESET, 'hash1')).resolves.toBe('user-1');
    await expect(store.consume(OpaqueTokenPurpose.PASSWORD_RESET, 'hash1')).resolves.toBeNull();
  });
});
