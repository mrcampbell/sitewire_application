export const config = {
  port: Number(process.env.PORT ?? 3000),
  apiBaseUrl: (process.env.API_BASE_URL ?? 'https://fake-users-api.vercel.app').replace(/\/+$/, ''),
  api: { timeoutMs: 5_000, maxAttempts: 8, baseDelayMs: 100, maxDelayMs: 1_000 },
  loader: { concurrency: 40, maxAgeMs: 5 * 60_000 },
};
