/** Linear-interpolated percentile of an ascending-sorted array. p in [0, 100]. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (rank - lo);
}

export interface Summary {
  n: number;
  mean: number;
  min: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
}

export function summarize(values: readonly number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    mean: n ? sorted.reduce((s, v) => s + v, 0) / n : Number.NaN,
    min: n ? (sorted[0] as number) : Number.NaN,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: n ? (sorted[n - 1] as number) : Number.NaN,
  };
}

export interface Interval {
  estimate: number;
  low: number;
  high: number;
}

/**
 * Wilson score interval for a proportion. Better than ±1.96·SE at small n
 * and near 0/1, which matters when "is it really 25%?" rests on ~100 samples.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  if (n === 0) return { estimate: Number.NaN, low: Number.NaN, high: Number.NaN };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { estimate: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

/** Counts per bucket [edges[i], edges[i+1]); the final bucket is >= the last edge. */
export function histogram(values: readonly number[], edges: readonly number[]): number[] {
  const counts = new Array<number>(edges.length).fill(0);
  for (const v of values) {
    let i = edges.length - 1;
    while (i > 0 && v < (edges[i] as number)) i--;
    counts[i] = (counts[i] as number) + 1;
  }
  return counts;
}

export interface Correlation {
  pFail: number;
  pFailAfterFail: number;
  pFailAfterOk: number;
  nAfterFail: number;
  nAfterOk: number;
}

/**
 * Are failures independent coin flips, or do they cluster? If P(fail | previous failed)
 * is much higher than P(fail | previous ok), immediate retries are a bad bet and
 * backoff matters more. Input is in request order; true = failed.
 */
export function failureCorrelation(failed: readonly boolean[]): Correlation {
  let afterFail = 0;
  let failAfterFail = 0;
  let afterOk = 0;
  let failAfterOk = 0;
  for (let i = 1; i < failed.length; i++) {
    if (failed[i - 1]) {
      afterFail++;
      if (failed[i]) failAfterFail++;
    } else {
      afterOk++;
      if (failed[i]) failAfterOk++;
    }
  }
  const fails = failed.filter(Boolean).length;
  return {
    pFail: failed.length ? fails / failed.length : Number.NaN,
    pFailAfterFail: afterFail ? failAfterFail / afterFail : Number.NaN,
    pFailAfterOk: afterOk ? failAfterOk / afterOk : Number.NaN,
    nAfterFail: afterFail,
    nAfterOk: afterOk,
  };
}

/**
 * Pooled two-proportion z statistic for k1/n1 vs k2/n2. |z| > 1.96 ≈ significant at 5%.
 * Used to keep the clustering verdict honest at small sample sizes.
 */
export function twoProportionZ(k1: number, n1: number, k2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return Number.NaN;
  const pooled = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  return se === 0 ? 0 : (k1 / n1 - k2 / n2) / se;
}

/**
 * Smallest attempt budget k such that, with independent failures at rate pFail,
 * the expected number of still-failing items across `population` is <= target.
 */
export function attemptsNeeded(pFail: number, population: number, targetExpectedFailures = 0.5): number {
  if (!(pFail > 0)) return 1;
  if (pFail >= 1) return Number.POSITIVE_INFINITY;
  const k = Math.ceil(Math.log(targetExpectedFailures / population) / Math.log(pFail));
  return Math.max(1, k);
}

export interface TimeoutCandidate {
  timeoutMs: number;
  /** P(an attempt succeeds within the timeout). */
  pSuccess: number;
  /** E[min(latency, timeout)]: what one attempt costs on average. */
  meanAttemptMs: number;
  /** meanAttemptMs / pSuccess: expected time spent per resolved request (ignores backoff). */
  expectedMsPerSuccess: number;
}

/**
 * Empirical trade-off curve for a client timeout. A tight timeout abandons slow
 * successes (which then need a retry) but also stops paying for slow failures.
 * Assumes attempts are independent draws from the measured distribution.
 */
export function timeoutCostCurve(
  samples: readonly { ms: number; ok: boolean }[],
  timeouts: readonly number[],
): TimeoutCandidate[] {
  return timeouts.map((timeoutMs) => {
    const n = samples.length;
    const successes = samples.filter((s) => s.ok && s.ms <= timeoutMs).length;
    const meanAttemptMs = n ? samples.reduce((sum, s) => sum + Math.min(s.ms, timeoutMs), 0) / n : Number.NaN;
    const pSuccess = n ? successes / n : Number.NaN;
    return {
      timeoutMs,
      pSuccess,
      meanAttemptMs,
      expectedMsPerSuccess: pSuccess > 0 ? meanAttemptMs / pSuccess : Number.POSITIVE_INFINITY,
    };
  });
}
