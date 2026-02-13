import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  correlationId: string;
  userId?: string;
  organizationId?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return asyncLocalStorage.run({ ...data }, fn);
  },

  get(): RequestContextData | undefined {
    return asyncLocalStorage.getStore();
  },

  setUser(userId: string, organizationId?: string): void {
    const store = asyncLocalStorage.getStore();
    if (store) {
      store.userId = userId;
      store.organizationId = organizationId;
    }
  },

  getCorrelationId(): string | undefined {
    return asyncLocalStorage.getStore()?.correlationId;
  },

  getUserId(): string | undefined {
    return asyncLocalStorage.getStore()?.userId;
  },

  getOrganizationId(): string | undefined {
    return asyncLocalStorage.getStore()?.organizationId;
  },
};
