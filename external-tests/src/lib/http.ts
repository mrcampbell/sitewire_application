import { BASE_URL, REQUEST_TIMEOUT_MS, USER_AGENT } from '../config.js';

export type Endpoint = 'users' | 'logins';

export interface SampleMeta {
  probe: string;
  runId: string;
  endpoint: Endpoint;
  userId?: number;
  /** How many requests the probe allowed in flight when this one was sent. */
  concurrency: number;
  /** 1-based; >1 only for probes that retry (scan). */
  attempt: number;
}

/** One request = one NDJSON line. Everything in the report is derived from these. */
export interface Sample extends SampleMeta {
  path: string;
  startedAt: string;
  /** Time to response headers. null if the request never got a response. */
  ttfbMs: number | null;
  /** Time to the last byte of the body. */
  totalMs: number;
  status: number | null;
  /** 2xx with a non-empty, parseable JSON body. */
  ok: boolean;
  bytes: number;
  /** http-<status> | empty-body | invalid-json | timeout | network: <msg> */
  error?: string;
  vercelCache?: string | null;
}

export interface TimedResponse {
  sample: Sample;
  body: unknown;
}

export const usersPath = () => '/users';
export const loginsPath = (id: number | string) => `/users/${id}/relationships/logins`;

const round = (ms: number) => Math.round(ms * 10) / 10;

/**
 * A single request with no retry and no interpretation beyond classification.
 * Probes need raw outcomes; retry policy is something we measure, not assume.
 */
export async function timedFetch(path: string, meta: SampleMeta, baseUrl = BASE_URL): Promise<TimedResponse> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  try {
    const res = await fetch(baseUrl + path, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const ttfbMs = performance.now() - t0;
    const text = await res.text();
    const totalMs = performance.now() - t0;

    let body: unknown;
    let error: string | undefined;
    if (text.length === 0) {
      error = 'empty-body';
    } else {
      try {
        body = JSON.parse(text);
      } catch {
        error = 'invalid-json';
      }
    }
    if (!res.ok) error = `http-${res.status}`;

    return {
      body,
      sample: {
        ...meta,
        path,
        startedAt,
        ttfbMs: round(ttfbMs),
        totalMs: round(totalMs),
        status: res.status,
        ok: res.ok && error === undefined,
        bytes: Buffer.byteLength(text),
        error,
        vercelCache: res.headers.get('x-vercel-cache'),
      },
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const message = err instanceof Error ? err.message : String(err);
    return {
      body: undefined,
      sample: {
        ...meta,
        path,
        startedAt,
        ttfbMs: null,
        totalMs: round(performance.now() - t0),
        status: null,
        ok: false,
        bytes: 0,
        error: name === 'TimeoutError' ? 'timeout' : `network: ${message}`,
      },
    };
  }
}
