import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config.js';
import { latestLogin } from './domain.js';
import type { User, UserLogins } from './types.js';

/* NOTE: 
 A very simple wrapper, which encapsulates the retry logc, as well as provides
 a future space for error message formatting, to be handled by error logging elsewhere.
*/
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }

  get retryable() {
    return this.status === undefined || this.status >= 500;
  }
}

export const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const isRetryable = (err: unknown) => err instanceof ApiError && err.retryable;

const backoffMs = (attempt: number) => {
  const { baseDelayMs, maxDelayMs } = config.api;
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return ceiling / 2 + (Math.random() * ceiling) / 2;
};

/* NOTE: there are denser ways to write teh function, but I index off of 
readability instead of compact or syntactic sugar */
async function getJson(path: string): Promise<unknown> {
  let res: Response;
  let text: string;

  try {
    res = await fetch(config.apiBaseUrl + path, {
      signal: AbortSignal.timeout(config.api.timeoutMs),
    });
    text = await res.text();
  } catch (err) {
    throw new ApiError(messageOf(err));
  }

  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}`, res.status);
  }

  if (!text) {
    throw new Error(`Empty response from ${path}`);
  }

  return JSON.parse(text);
}

/* NOTE: a very basic wrapper with sensible defaults. I'd make it more dynamic, with 
passible defaults, but the case was narrow enough for a simple, "write once, use everywhere"
design.
*/
async function withRetry<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request();
    } catch (err) {
      const outOfAttempts = attempt >= config.api.maxAttempts;
      if (!isRetryable(err) || outOfAttempts) {
        throw err;
      }

      await sleep(backoffMs(attempt));
    }
  }
}

export const getUsers = () =>
  withRetry(async () => {
    const body = await getJson('/users');

    if (!Array.isArray(body)) {
      throw new Error('Unexpected /users response');
    }

    return body as User[];
  });

export const getLatestLogin = (userId: number) =>
  withRetry(async () => {
    const path = `/users/${userId}/relationships/logins`;
    const body = (await getJson(path)) as Partial<UserLogins> | null;

    if (body?.user_id !== userId || !Array.isArray(body.logins)) {
      throw new Error(`Unexpected logins response for user ${userId}`);
    }

    return latestLogin(body.logins);
  });
