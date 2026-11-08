import { sleep } from './random.js';
import { timedFetch, type Sample, type SampleMeta, type TimedResponse } from './http.js';

/** 5xx and transport failures are worth retrying; 4xx and malformed 2xx are not. */
export const isRetryable = (s: Sample) => s.status === null || s.status >= 500;

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onSample?: (sample: Sample) => void;
}

/** Exponential backoff with "equal jitter": half fixed, half random. */
export function backoffMs(attempt: number, baseDelayMs = 100, maxDelayMs = 2000): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return exp / 2 + Math.random() * (exp / 2);
}

/**
 * Test-harness retry used by the scan probe and live contract tests so they can
 * get *through* the noise. Every attempt is still recorded via onSample.
 */
export async function fetchWithRetry(
  path: string,
  meta: Omit<SampleMeta, 'attempt'>,
  { maxAttempts, baseDelayMs, maxDelayMs, onSample }: RetryOptions,
): Promise<TimedResponse & { attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    const res = await timedFetch(path, { ...meta, attempt });
    onSample?.(res.sample);
    if (res.sample.ok || !isRetryable(res.sample) || attempt >= maxAttempts) {
      return { ...res, attempts: attempt };
    }
    await sleep(backoffMs(attempt, baseDelayMs, maxDelayMs));
  }
}
