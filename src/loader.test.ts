import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from './config.js';
import { currentLoad, Load, type Row } from './loader.js';
import { loginsFor, mockApi, users } from './test/mock-api.js';

const defaults = { api: { ...config.api }, loader: { ...config.loader } };

beforeEach(() => Object.assign(config.api, { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 }));
afterEach(() => {
  Object.assign(config.api, defaults.api);
  Object.assign(config.loader, defaults.loader);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const healthy = (count: number) => (path: string) =>
  path === '/users' ? { status: 200, body: users(count) } : { status: 200, body: loginsFor(path) };

describe('Load', () => {
  it('loads every user and emits one event per row', async () => {
    mockApi(healthy(5));
    const load = new Load();
    const events: [number, Row][] = [];
    load.subscribe((user, row) => events.push([user.id, row]));

    expect(await load.users).toHaveLength(5);
    await load.done;

    expect(events).toHaveLength(5);
    expect(load.rows.get(3)).toEqual({ status: 'loaded', login: { login_time: '2026-09-10T08:04:17Z', ip_v4: '10.0.0.3' } });
    expect(load.finishedAt).toBeDefined();
  });

  it('never has more than the configured number of requests in flight', async () => {
    config.loader.concurrency = 3;
    const api = mockApi(healthy(20));
    await new Load().done;
    expect(api.maxInFlight).toBe(3);
  });

  it('marks a user failed after retries, and retry() recovers it', async () => {
    let user2Up = false;
    mockApi((path) => (path.startsWith('/users/2/') && !user2Up ? { status: 500 } : healthy(3)(path)));
    const load = new Load();
    await load.done;
    expect(load.rows.get(2)).toEqual({ status: 'failed', error: 'HTTP 500' });

    user2Up = true;
    await load.retry((await load.users)[1]!);
    expect(load.rows.get(2)).toMatchObject({ status: 'loaded' });
  });

  it('marks the load failed when /users never succeeds', async () => {
    mockApi(() => ({ status: 500 }));
    const load = new Load();
    await expect(load.users).rejects.toMatchObject({ status: 500 });
    await load.done;
    expect(load.failed).toBe(true);
  });
});

describe('currentLoad', () => {
  it('reuses a fresh load, and replaces a failed or stale one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let up = false;
    mockApi((path) => (up ? healthy(2)(path) : { status: 500 }));

    const failed = currentLoad();
    await failed.done;

    up = true;
    const fresh = currentLoad();
    expect(fresh).not.toBe(failed);
    await fresh.done;
    expect(currentLoad()).toBe(fresh);

    vi.setSystemTime(Date.now() + config.loader.maxAgeMs + 1);
    expect(currentLoad()).not.toBe(fresh);
  });
});
