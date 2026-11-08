import { loadProbeSamples } from '../src/lib/results.js';
import { pick, type Rng } from '../src/lib/random.js';
import type { LatencyModel } from './server.js';

/**
 * LATENCY spec:
 *   empirical      resample real measured latencies (per endpoint, per success/failure)
 *   uniform:A:B    uniform between A and B ms (README's "~10 ms to 3 s" is uniform:10:3000)
 *   fixed:N        always N ms (fast, deterministic tests)
 */
export function parseLatency(spec: string, rng: Rng): LatencyModel {
  const [kind, a, b] = spec.split(':');

  if (kind === 'fixed') {
    const ms = Number(a ?? 0);
    return () => ms;
  }

  if (kind === 'uniform') {
    const min = Number(a ?? 10);
    const max = Number(b ?? 3000);
    return () => min + rng() * (max - min);
  }

  if (kind === 'empirical') {
    const pools = new Map<string, number[]>();
    for (const probe of ['sample', 'concurrency']) {
      for (const s of loadProbeSamples(probe).samples) {
        if (s.status === null) continue; // timeouts/network errors aren't server latency
        const key = `${s.endpoint}:${s.ok}`;
        pools.set(key, [...(pools.get(key) ?? []), s.totalMs]);
      }
    }
    if (pools.size === 0) throw new Error('LATENCY=empirical needs probe results: run `npm run probe:sample` first.');
    const all = [...pools.values()].flat();
    return (endpoint, failed) => pick(rng, pools.get(`${endpoint}:${!failed}`) ?? all);
  }

  throw new Error(`Unknown LATENCY spec "${spec}" (use empirical, uniform:A:B or fixed:N)`);
}
