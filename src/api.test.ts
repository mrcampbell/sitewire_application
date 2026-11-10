import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getLatestLogin, getUsers } from './api.js';
import { config } from './config.js';
import { loginsFor, mockApi, users } from './test/mock-api.js';

const defaults = { ...config.api };

beforeEach(() => Object.assign(config.api, { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 50 }));
afterEach(() => {
  Object.assign(config.api, defaults);
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('retries 500s until one succeeds', async () => {
    const api = mockApi((_, call) => (call < 3 ? { status: 500 } : { status: 200, body: users(2) }));
    expect(await getUsers()).toEqual(users(2));
    expect(api.calls.get('/users')).toBe(3);
  });

  it('gives up after maxAttempts', async () => {
    const api = mockApi(() => ({ status: 500 }));
    await expect(getUsers()).rejects.toMatchObject({ status: 500 });
    expect(api.calls.get('/users')).toBe(3);
  });

  it('does not retry a 404', async () => {
    const api = mockApi(() => ({ status: 404 }));
    await expect(getLatestLogin(1001)).rejects.toBeInstanceOf(ApiError);
    expect(api.calls.get('/users/1001/relationships/logins')).toBe(1);
  });

  it('rejects an empty 200 body without retrying', async () => {
    const api = mockApi(() => ({ status: 200 }));
    await expect(getLatestLogin(1)).rejects.toThrow('Empty response');
    expect(api.calls.get('/users/1/relationships/logins')).toBe(1);
  });

  it('times out a hung request and retries it', async () => {
    mockApi((path, call) => (call === 1 ? 'hang' : { status: 200, body: loginsFor(path) }));
    expect(await getLatestLogin(1)).not.toBeNull();
  });

  it('returns the most recent login, not the last one', async () => {
    mockApi((path) => ({ status: 200, body: loginsFor(path) }));
    expect(await getLatestLogin(7)).toEqual({ login_time: '2026-09-10T08:04:17Z', ip_v4: '10.0.0.7' });
  });

  it('returns null for a user who never logged in', async () => {
    mockApi(() => ({ status: 200, body: { user_id: 1, logins: [] } }));
    expect(await getLatestLogin(1)).toBeNull();
  });

  it('rejects logins that belong to a different user', async () => {
    mockApi(() => ({ status: 200, body: { user_id: 2, logins: [] } }));
    await expect(getLatestLogin(1)).rejects.toThrow('Unexpected logins response');
  });
});
