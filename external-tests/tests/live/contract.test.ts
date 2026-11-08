/**
 * Live contract tests against the real API (npm run test:live).
 *
 * They pin down both the documented contract and the undocumented behaviour the
 * app has to handle. If one starts failing, the API changed and the app's
 * assumptions need revisiting. Random 500s are retried so they don't cause flakes,
 * except in the test that is *about* 500s.
 */
import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../../src/config.js';
import { isIpv4 } from '../../src/analysis.js';
import { loginsPath, timedFetch, usersPath, type Endpoint, type TimedResponse } from '../../src/lib/http.js';
import { runPool } from '../../src/lib/pool.js';
import { fetchWithRetry } from '../../src/lib/retry.js';
import type { User, UserLogins } from '../../src/types.js';

const meta = (endpoint: Endpoint) => ({ probe: 'contract', runId: 'contract', endpoint, concurrency: 1 });
const get = (path: string, endpoint: Endpoint = 'logins'): Promise<TimedResponse> =>
  fetchWithRetry(path, meta(endpoint), { maxAttempts: 12 });

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe(`GET /users (${BASE_URL})`, () => {
  it('returns a non-empty JSON array with the documented fields', async () => {
    const res = await get(usersPath(), 'users');
    expect(res.sample.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const users = res.body as User[];
    expect(users.length).toBeGreaterThan(0);
    const invalid = users.filter(
      (u) =>
        !Number.isInteger(u.id) ||
        typeof u.first_name !== 'string' ||
        typeof u.last_name !== 'string' ||
        typeof u.email !== 'string',
    );
    expect(invalid).toEqual([]);
  });

  it('has unique ids (safe to key rows by id)', async () => {
    const users = (await get(usersPath(), 'users')).body as User[];
    expect(new Set(users.map((u) => u.id)).size).toBe(users.length);
  });

  it('returns everything in one response: no pagination', async () => {
    const page = (await get(`${usersPath()}?page=2&limit=10`, 'users')).body as User[];
    const all = (await get(usersPath(), 'users')).body as User[];
    expect(page.length).toBe(all.length);
  });

  it('allows cross-origin requests (even on failures)', async () => {
    const res = await fetch(BASE_URL + usersPath());
    await res.arrayBuffer();
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('GET /users/:id/relationships/logins', () => {
  it('returns logins for the requested user with the documented fields', async () => {
    const res = await get(loginsPath(1));
    expect(res.sample.status).toBe(200);

    const body = res.body as UserLogins;
    expect(body.user_id).toBe(1);
    expect(Array.isArray(body.logins)).toBe(true);
    for (const login of body.logins) {
      expect(login.login_time).toMatch(ISO_UTC);
      expect(isIpv4(login.ip_v4)).toBe(true);
    }
  });

  it('is deterministic: repeated successful responses are identical (cacheable, safe to retry)', async () => {
    const a = await get(loginsPath(1));
    const b = await get(loginsPath(1));
    expect(b.body).toEqual(a.body);
  });

  it('does NOT order logins by time: the most recent is not reliably the last item', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    const responses = await runPool(ids, 5, (id) => get(loginsPath(id)));
    const lastIsNotLatest = responses.filter((r) => {
      const times = (r.body as UserLogins).logins.map((l) => Date.parse(l.login_time));
      return times.length > 0 && times.at(-1) !== Math.max(...times);
    });
    expect(lastIsNotLatest.length).toBeGreaterThan(0);
  });
});

describe('error behaviour', () => {
  it('random failures are HTTP 500 with a JSON message', async () => {
    let failure: TimedResponse | undefined;
    // P(no 500 in 40 tries at 25%) ≈ 1e-5
    for (let i = 0; i < 40 && !failure; i++) {
      const res = await timedFetch(loginsPath(1), { ...meta('logins'), attempt: 1 });
      if (res.sample.status === 500) failure = res;
    }
    expect(failure, 'saw no 500 in 40 requests').toBeDefined();
    expect(failure?.body).toEqual({ message: expect.any(String) });
  });

  it('unknown user id is a 404 with a message (do not retry)', async () => {
    const res = await get(loginsPath(1_000_001));
    expect(res.sample.status).toBe(404);
    expect(res.body).toEqual({ message: expect.stringContaining('1000001') });
  });

  it.each(['0', 'abc'])('quirk: id "%s" returns 200 with an EMPTY body (res.json() would throw)', async (id) => {
    const res = await get(loginsPath(id));
    expect(res.sample.status).toBe(200);
    expect(res.sample.error).toBe('empty-body');
  });
});
