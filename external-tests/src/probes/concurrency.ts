/**
 * Concurrency sweep on the logins endpoint (the one the app calls 1,000 times), no retries.
 *
 * Answers: does throughput keep scaling with parallelism? Does latency or the failure
 * rate degrade under load? Is there any rate limiting (429)?
 *
 *   npm run probe:concurrency -- --levels 1,5,10,20,40 --per-level 60
 */
import { parseArgs } from 'node:util';
import { analyzeConcurrency } from '../analysis.js';
import { BASE_URL, MAX_CONCURRENCY, USER_ID_MAX } from '../config.js';
import { intList, positiveInt } from '../lib/cli.js';
import { loginsPath, timedFetch, type Sample } from '../lib/http.js';
import { runPool } from '../lib/pool.js';
import { randomInt, sleep } from '../lib/random.js';
import { createRecorder } from '../lib/recorder.js';
import { fmtMs, fmtPct, renderConcurrency } from '../render.js';

const { values } = parseArgs({
  options: {
    levels: { type: 'string', default: '1,5,10,20,40' },
    'per-level': { type: 'string', default: '60' },
    'pause-ms': { type: 'string', default: '2000' },
  },
});

const levels = intList(values.levels, 'levels');
const perLevel = positiveInt(values['per-level'], 'per-level');
const pauseMs = Number(values['pause-ms']);

const rec = createRecorder('concurrency');
const all: Sample[] = [];
console.log(`Concurrency sweep against ${BASE_URL}: levels ${levels.join(', ')} × ${perLevel} requests\n`);

for (const requested of levels) {
  const concurrency = Math.min(requested, MAX_CONCURRENCY);
  if (concurrency !== requested) console.warn(`  capping ${requested} → ${MAX_CONCURRENCY} (politeness limit)`);

  const ids = Array.from({ length: perLevel }, () => randomInt(Math.random, 1, USER_ID_MAX));
  const samples = await runPool(ids, concurrency, async (userId) => {
    const { sample } = await timedFetch(loginsPath(userId), {
      probe: 'concurrency',
      runId: rec.runId,
      endpoint: 'logins',
      userId,
      concurrency,
      attempt: 1,
    });
    rec.write(sample);
    return sample;
  });
  all.push(...samples);

  const [row] = analyzeConcurrency(samples);
  if (row) {
    console.log(
      `  c=${String(concurrency).padStart(3)}  fail ${fmtPct(row.failureRate.estimate).padStart(6)}  p50 ${fmtMs(row.okLatency.p50).padStart(8)}  p95 ${fmtMs(row.okLatency.p95).padStart(8)}  ${row.okPerSec.toFixed(2)} ok/s  429s ${row.status429}`,
    );
  }
  await sleep(pauseMs);
}

console.log(`\n${renderConcurrency(analyzeConcurrency(all))}\n\nRaw samples: ${rec.file}`);
