/**
 * Baseline probe: N strictly sequential requests per endpoint, no retries.
 *
 * Answers: what is the real failure rate (with a confidence interval)? What does the
 * latency distribution look like for successes vs failures? Do failures cluster?
 *
 *   npm run probe:sample -- --n 100 --endpoint both
 */
import { parseArgs } from 'node:util';
import { analyzeEndpoint } from '../analysis.js';
import { BASE_URL, USER_ID_MAX } from '../config.js';
import { positiveInt } from '../lib/cli.js';
import { loginsPath, timedFetch, usersPath, type Endpoint, type Sample } from '../lib/http.js';
import { randomInt } from '../lib/random.js';
import { createRecorder, tick } from '../lib/recorder.js';
import { renderEndpoint } from '../render.js';

const { values } = parseArgs({
  options: {
    n: { type: 'string', default: '100' },
    endpoint: { type: 'string', default: 'both' },
  },
});

const n = positiveInt(values.n, 'n');
const endpoints: Endpoint[] =
  values.endpoint === 'both' ? ['users', 'logins'] : values.endpoint === 'users' || values.endpoint === 'logins' ? [values.endpoint] : [];
if (endpoints.length === 0) throw new Error('--endpoint must be users, logins or both');

const rec = createRecorder('sample');
console.log(`Sequential sampling against ${BASE_URL}: ${n} requests × ${endpoints.join(', ')}  (. ok  x failed  t timeout)\n`);

for (const endpoint of endpoints) {
  console.log(`GET ${endpoint === 'users' ? usersPath() : loginsPath(':id')}`);
  const samples: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const userId = endpoint === 'logins' ? randomInt(Math.random, 1, USER_ID_MAX) : undefined;
    const path = userId === undefined ? usersPath() : loginsPath(userId);
    const { sample } = await timedFetch(path, { probe: 'sample', runId: rec.runId, endpoint, userId, concurrency: 1, attempt: 1 });
    rec.write(sample);
    samples.push(sample);
    tick(sample, i);
  }
  console.log(`\n\n${renderEndpoint(endpoint === 'users' ? 'GET /users' : 'GET /users/:id/relationships/logins', analyzeEndpoint(samples))}\n`);
}

console.log(`Raw samples: ${rec.file}`);
