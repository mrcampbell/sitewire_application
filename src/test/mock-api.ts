import { vi } from 'vitest';

export type Reply = { status: number; body?: unknown } | 'hang';

export function mockApi(reply: (path: string, call: number) => Reply) {
  const calls = new Map<string, number>();
  const stats = { calls, maxInFlight: 0 };
  let inFlight = 0;

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const call = (calls.get(path) ?? 0) + 1;
    calls.set(path, call);
    stats.maxInFlight = Math.max(stats.maxInFlight, ++inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const r = reply(path, call);
      if (r === 'hang') {
        return await new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
      }
      return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
    } finally {
      inFlight--;
    }
  });

  return stats;
}

export const users = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, first_name: 'Ada', last_name: `No${i + 1}`, email: `u${i + 1}@x.io` }));

export const loginsFor = (path: string) => {
  const userId = Number(path.split('/')[2]);
  return {
    user_id: userId,
    logins: [
      { login_time: '2026-07-30T12:02:41Z', ip_v4: '115.31.131.47' },
      { login_time: '2026-09-10T08:04:17Z', ip_v4: `10.0.0.${userId}` },
      { login_time: '2026-02-28T20:21:21Z', ip_v4: '118.36.51.49' },
    ],
  };
};
