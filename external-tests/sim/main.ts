/**
 * Local simulator for the Fake Users API.
 *
 *   npm run sim                                       # defaults: calibrated if probe data exists
 *   FAIL_RATE=0 LATENCY=fixed:20 npm run sim          # happy path, fast
 *   USERS_FAIL_RATE=1 npm run sim                     # page-level error state
 *   FAIL_RATE=1 USERS_FAIL_RATE=0 npm run sim         # every row fails
 *   LATENCY=uniform:2500:3000 npm run sim             # everything slow
 *   SEED=42 npm run sim                               # reproducible run
 *
 * Point the app at it with API_BASE_URL=http://localhost:4000
 */
import { listResultFiles, loadProbeSamples } from '../src/lib/results.js';
import { mulberry32 } from '../src/lib/random.js';
import { loadSimData } from './data.js';
import { parseLatency } from './latency.js';
import { createSimServer } from './server.js';

const env = process.env;
const rng = env.SEED ? mulberry32(Number(env.SEED)) : Math.random;
const port = Number(env.PORT ?? 4000);

const hasProbeData = listResultFiles('sample').length > 0;
const latencySpec = env.LATENCY ?? (hasProbeData ? 'empirical' : 'uniform:10:3000');

/** Default fail rate: measured, if we have measurements; otherwise the README's 25%. */
function measuredFailRate(): number | undefined {
  const logins = loadProbeSamples('sample').samples.filter((s) => s.endpoint === 'logins');
  return logins.length ? logins.filter((s) => !s.ok).length / logins.length : undefined;
}
const failRate = env.FAIL_RATE !== undefined ? Number(env.FAIL_RATE) : (measuredFailRate() ?? 0.25);
const usersFailRate = env.USERS_FAIL_RATE !== undefined ? Number(env.USERS_FAIL_RATE) : undefined;

const data = loadSimData(rng);
const server = createSimServer({
  users: data.users,
  logins: data.logins,
  failRate,
  usersFailRate,
  latency: parseLatency(latencySpec, rng),
  rng,
  log: env.SIM_LOG === '1',
});

server.listen(port, () => {
  console.log(`Simulated Fake Users API on http://localhost:${port}`);
  console.log(`  data:       ${data.source} (${data.users.length} users)`);
  console.log(`  fail rate:  logins ${(failRate * 100).toFixed(1)}%, /users ${((usersFailRate ?? failRate) * 100).toFixed(1)}%`);
  console.log(`  latency:    ${latencySpec}${env.SEED ? `   seed: ${env.SEED}` : ''}`);
  console.log('  SIM_LOG=1 to log each request');
});
