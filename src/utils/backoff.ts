import { setTimeout as delay } from 'node:timers/promises';

export interface BackoffOptions {
  retries?: number;
  baseMs?: number;
  factor?: number;
  onRetry?: (error: unknown, attempt: number) => void;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_MS = 1000;
const DEFAULT_FACTOR = 3;

export async function withBackoff<T>(fn: () => Promise<T>, options?: BackoffOptions): Promise<T> {
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const baseMs = options?.baseMs ?? DEFAULT_BASE_MS;
  const factor = options?.factor ?? DEFAULT_FACTOR;
  const shouldRetry = options?.shouldRetry ?? (() => true);

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) {
        throw error;
      }
      options?.onRetry?.(error, attempt + 1);
      const waitMs = baseMs * factor ** attempt;
      await delay(waitMs);
      attempt += 1;
    }
  }

  throw lastError ?? new Error('withBackoff failed without an error');
}
