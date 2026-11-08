/**
 * Full scan: fetch /users, then every user's logins with bounded concurrency and retries.
 *
 * Two outputs:
 *   1. Every attempt is recorded, so this doubles as an end-to-end benchmark of a
 *      simple-but-correct strategy: the baseline the app should match or beat.
 *   2. results/dataset.json, a snapshot that feeds the data-quality report and the
 *      simulator (so offline runs use the real data shape).
 *
 *   npm run probe:scan -- --concurrency 10 --max-attempts 8
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { analyzeDataset, analyzeScan } from '../analysis.js';
import { BASE_URL, DATASET_FILE } from '../config.js';
import { positiveInt } from '../lib/cli.js';
import { loginsPath, usersPath, type Sample } from '../lib/http.js';
import { runPool } from '../lib/pool.js';
import { createRecorder } from '../lib/recorder.js';
import { fetchWithRetry } from '../lib/retry.js';
import { renderDataQuality, renderScan } from '../render.js';
import type { Dataset, User, UserLogins } from '../types.js';

const { values } = parseArgs({
  options: {
    concurrency: { type: 'string', default: '10' },
    'max-attempts': { type: 'string', default: '8' },
  },
});

const concurrency = positiveInt(values.concurrency, 'concurrency');
const maxAttempts = positiveInt(values['max-attempts'], 'max-attempts');

const rec = createRecorder('scan');
const samples: Sample[] = [];
const record = (s: Sample) => {
  rec.write(s);
  samples.push(s);
};

console.log(`Full scan against ${BASE_URL} (concurrency ${concurrency}, up to ${maxAttempts} attempts each)`);

const usersRes = await fetchWithRetry(
  usersPath(),
  { probe: 'scan', runId: rec.runId, endpoint: 'users', concurrency: 1 },
  { maxAttempts, onSample: record },
);
if (!usersRes.sample.ok || !Array.isArray(usersRes.body)) {
  console.error(`GET /users failed after ${usersRes.attempts} attempts: ${usersRes.sample.error}`);
  process.exit(1);
}
const users = usersRes.body as User[];
console.log(`GET /users → ${users.length} users after ${usersRes.attempts} attempt(s)`);

let done = 0;
const results = await runPool(users, concurrency, async (user) => {
  const res = await fetchWithRetry(
    loginsPath(user.id),
    { probe: 'scan', runId: rec.runId, endpoint: 'logins', userId: user.id, concurrency },
    { maxAttempts, onSample: record },
  );
  if (++done % 100 === 0) console.log(`  ${done}/${users.length}`);
  return { user, res };
});

const dataset: Dataset = {
  scannedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  users,
  logins: {},
  unresolved: [],
};
for (const { user, res } of results) {
  if (res.sample.ok) dataset.logins[String(user.id)] = res.body as UserLogins;
  else dataset.unresolved.push({ userId: user.id, lastError: res.sample.error ?? 'unknown' });
}
writeFileSync(DATASET_FILE, `${JSON.stringify(dataset, null, 2)}\n`);

const scan = analyzeScan(samples);
if (scan) console.log(`\n${renderScan(scan)}`);
console.log(`\n${renderDataQuality(analyzeDataset(dataset))}`);
console.log(`\nRaw samples: ${rec.file}\nDataset:     ${DATASET_FILE}`);
