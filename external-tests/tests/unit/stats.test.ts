import { describe, expect, it } from 'vitest';
import {
  attemptsNeeded,
  failureCorrelation,
  histogram,
  percentile,
  summarize,
  timeoutCostCurve,
  wilsonInterval,
} from '../../src/lib/stats.js';

describe('percentile', () => {
  it('interpolates between ranks', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([10, 20, 30, 40], 0)).toBe(10);
    expect(percentile([10, 20, 30, 40], 100)).toBe(40);
  });

  it('is NaN for no data rather than a misleading 0', () => {
    expect(percentile([], 50)).toBeNaN();
    expect(summarize([]).mean).toBeNaN();
  });
});

describe('wilsonInterval', () => {
  it('matches the textbook interval for 25/100', () => {
    const i = wilsonInterval(25, 100);
    expect(i.estimate).toBe(0.25);
    expect(i.low).toBeCloseTo(0.1755, 3);
    expect(i.high).toBeCloseTo(0.343, 3);
  });

  it('stays inside [0, 1] at the extremes', () => {
    expect(wilsonInterval(0, 10).low).toBe(0);
    expect(wilsonInterval(10, 10).high).toBe(1);
  });
});

describe('histogram', () => {
  it('buckets by [edge, nextEdge) with an open final bucket', () => {
    expect(histogram([0, 5, 10, 15, 999], [0, 10, 20])).toEqual([2, 2, 1]);
  });
});

describe('failureCorrelation', () => {
  it('computes conditional failure rates from request order', () => {
    const c = failureCorrelation([true, true, false, true, false, false]);
    expect(c.pFail).toBe(0.5);
    expect(c.pFailAfterFail).toBeCloseTo(1 / 3);
    expect(c.pFailAfterOk).toBe(0.5);
    expect(c.nAfterFail + c.nAfterOk).toBe(5);
  });
});

describe('attemptsNeeded', () => {
  it('sizes a retry budget for 1,000 users at 25% failure', () => {
    // 1000 · 0.25^5 ≈ 0.98 > 0.5, 1000 · 0.25^6 ≈ 0.24 ≤ 0.5
    expect(attemptsNeeded(0.25, 1000, 0.5)).toBe(6);
    expect(attemptsNeeded(0.25, 1000, 1)).toBe(5);
  });

  it('handles degenerate rates', () => {
    expect(attemptsNeeded(0, 1000)).toBe(1);
    expect(attemptsNeeded(1, 1000)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('timeoutCostCurve', () => {
  const samples = [
    { ms: 100, ok: true },
    { ms: 1000, ok: true },
    { ms: 3000, ok: false },
  ];

  it('with no timeout, pays full latency for every attempt', () => {
    const [c] = timeoutCostCurve(samples, [Number.POSITIVE_INFINITY]);
    expect(c?.pSuccess).toBeCloseTo(2 / 3);
    expect(c?.expectedMsPerSuccess).toBeCloseTo(2050);
  });

  it('a tight timeout trades lost successes for cheaper failures', () => {
    const [c] = timeoutCostCurve(samples, [500]);
    expect(c?.pSuccess).toBeCloseTo(1 / 3);
    expect(c?.meanAttemptMs).toBeCloseTo(1100 / 3);
    expect(c?.expectedMsPerSuccess).toBeCloseTo(1100);
  });

  it('is infinite when nothing can succeed', () => {
    const [c] = timeoutCostCurve(samples, [50]);
    expect(c?.expectedMsPerSuccess).toBe(Number.POSITIVE_INFINITY);
  });
});
