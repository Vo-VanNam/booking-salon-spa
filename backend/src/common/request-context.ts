import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  method?: string;
  path?: string;
  userId?: string;
  role?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function setRequestUser(userId?: string, role?: string): void {
  const context = storage.getStore();
  if (!context) return;
  context.userId = userId;
  context.role = role;
}
