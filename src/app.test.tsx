import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginsFor, mockApi, users } from './test/mock-api.js';

const loadApp = async () => {
  vi.resetModules();
  const [{ app }, { currentLoad }, { config }] = await Promise.all([
    import('./app.js'),
    import('./loader.js'),
    import('./config.js'),
  ]);
  Object.assign(config.api, { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 });
  return { app, currentLoad };
};

afterEach(() => vi.unstubAllGlobals());

type Reader = ReadableStreamDefaultReader<Uint8Array>;

async function readUntil(source: Response | Reader, done: (text: string) => boolean, cancel = true) {
  const reader = source instanceof Response ? source.body!.getReader() : source;
  const decoder = new TextDecoder();
  let text = '';

  while (!done(text)) {
    const { value, done: ended } = await reader.read();
    if (ended) break;
    text += decoder.decode(value, { stream: true });
  }

  if (cancel) await reader.cancel();
  return text;
}

describe('app', () => {
  it('renders every user with a pending or loaded row and the total', async () => {
    mockApi((path) => (path === '/users' ? { status: 200, body: users(3) } : { status: 200, body: loginsFor(path) }));
    const { app, currentLoad } = await loadApp();

    const res = await app.request('/');
    const html = await res.text();
    await currentLoad().done;

    expect(res.status).toBe(200);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('id="row-1"');
    expect(html).toContain('id="row-3"');
    expect(html).toMatch(/Users<\/div><div class="stat-value[^"]*">3</);
  });

  it('shows the error state when the user list cannot be loaded', async () => {
    mockApi(() => ({ status: 500 }));
    const { app } = await loadApp();

    const res = await app.request('/');

    expect(res.status).toBe(502);
    expect(await res.text()).toContain('load the user list');
  });

  it('retries a failed row and redirects back', async () => {
    let user2Up = false;
    mockApi((path) => {
      if (path === '/users') return { status: 200, body: users(2) };
      if (path.startsWith('/users/2/') && !user2Up) return { status: 500 };
      return { status: 200, body: loginsFor(path) };
    });
    const { app, currentLoad } = await loadApp();
    await currentLoad().done;
    expect(currentLoad().rows.get(2)?.status).toBe('failed');

    user2Up = true;
    const res = await app.request('/users/2/retry', { method: 'POST' });

    expect(res.status).toBe(302);
    expect(currentLoad().rows.get(2)?.status).toBe('loaded');
  });

  it('streams already-resolved rows and the summary when a client connects', async () => {
    mockApi((path) => (path === '/users' ? { status: 200, body: users(2) } : { status: 200, body: loginsFor(path) }));
    const { app, currentLoad } = await loadApp();
    await currentLoad().done;

    const res = await app.request('/events');
    const text = await readUntil(res, (t) => t.includes('event: status'));

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(text).toContain('event: row');
    expect(text).toContain('id="row-1"');
    expect(text).toContain('id="row-2"');
    expect(text).toContain('id="stats"');
  });

  it('pushes a retried row through an open stream', async () => {
    let user2Up = false;
    mockApi((path) => {
      if (path === '/users') return { status: 200, body: users(2) };
      if (path.startsWith('/users/2/') && !user2Up) return { status: 500 };
      return { status: 200, body: loginsFor(path) };
    });
    const { app, currentLoad } = await loadApp();
    await currentLoad().done;

    const res = await app.request('/events');
    const reader = res.body!.getReader();
    await readUntil(reader, (t) => t.includes('event: status'), false);

    user2Up = true;
    await app.request('/users/2/retry', { method: 'POST' });
    const text = await readUntil(reader, (t) => t.includes('10.0.0.2'));

    expect(text).toContain('id="row-2"');
  });

  it('serves the client script', async () => {
    const { app } = await loadApp();
    const res = await app.request('/users.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("new EventSource('/events')");
  });

  it('reports health', async () => {
    const { app } = await loadApp();
    const res = await app.request('/health');
    expect(await res.json()).toEqual({ ok: true });
  });
});
