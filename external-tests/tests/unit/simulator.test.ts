import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { loginsPath, timedFetch, usersPath, type SampleMeta } from '../../src/lib/http.js';
import { runPool } from '../../src/lib/pool.js';
import { mulberry32 } from '../../src/lib/random.js';
import { syntheticData } from '../../sim/data.js';
import { createSimServer, type SimOptions } from '../../sim/server.js';

/**
 * The simulator is only useful if it misbehaves the same way the real API does.
 * These tests pin it to the behaviours the live contract tests observe.
 */

const meta: SampleMeta = { probe: 'test', runId: 'test', endpoint: 'logins', concurrency: 1, attempt: 1 };
const data = syntheticData(mulberry32(1), 20, Date.parse('2026-11-07T00:00:00Z'));
let server: Server | undefined;

async function start(overrides: Partial<SimOptions> = {}): Promise<string> {
  server = createSimServer({ ...data, failRate: 0, latency: () => 0, ...overrides });
  await new Promise<void>((resolve) => server?.listen(0, resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

describe('simulator', () => {
  it('serves users and logins with the documented shapes', async () => {
    const base = await start();
    const users = await timedFetch(usersPath(), { ...meta, endpoint: 'users' }, base);
    expect(users.sample.status).toBe(200);
    expect(users.body).toHaveLength(20);

    const logins = await timedFetch(loginsPath(3), meta, base);
    expect(logins.body).toMatchObject({ user_id: 3, logins: expect.any(Array) });
  });

  it('mirrors the real error responses', async () => {
    const base = await start();
    const missing = await timedFetch(loginsPath(1001), meta, base);
    expect(missing.sample.status).toBe(404);
    expect(missing.body).toEqual({ message: "Could not find a user with ID '1001'" });

    for (const id of ['0', 'abc']) {
      const quirk = await timedFetch(loginsPath(id), meta, base);
      expect(quirk.sample.status).toBe(200);
      expect(quirk.sample.error).toBe('empty-body');
    }
  });

  it('fails with the real 500 body when told to', async () => {
    const base = await start({ failRate: 1 });
    const res = await timedFetch(loginsPath(1), meta, base);
    expect(res.sample.status).toBe(500);
    expect(res.body).toEqual({ message: 'Something went wrong.' });
  });

  it('can fail /users independently (page-level error demo)', async () => {
    const base = await start({ failRate: 0, usersFailRate: 1 });
    expect((await timedFetch(usersPath(), { ...meta, endpoint: 'users' }, base)).sample.status).toBe(500);
    expect((await timedFetch(loginsPath(1), meta, base)).sample.status).toBe(200);
  });

  it('hits the configured failure rate', async () => {
    const base = await start({ failRate: 0.25, rng: mulberry32(7) });
    const results = await runPool(Array.from({ length: 400 }, (_, i) => (i % 20) + 1), 20, (id) => timedFetch(loginsPath(id), meta, base));
    const rate = results.filter((r) => r.sample.status === 500).length / results.length;
    expect(rate).toBeGreaterThan(0.19);
    expect(rate).toBeLessThan(0.31);
  });

  it('applies the latency model', async () => {
    const base = await start({ latency: () => 150 });
    const res = await timedFetch(loginsPath(1), meta, base);
    expect(res.sample.totalMs).toBeGreaterThanOrEqual(140);
  });
});
