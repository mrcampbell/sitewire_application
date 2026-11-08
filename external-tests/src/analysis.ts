import type { Sample } from './lib/http.js';
import {
  attemptsNeeded,
  failureCorrelation,
  histogram,
  summarize,
  timeoutCostCurve,
  wilsonInterval,
  type Correlation,
  type Interval,
  type Summary,
  type TimeoutCandidate,
} from './lib/stats.js';
import type { Dataset, Login } from './types.js';

// ---------------------------------------------------------------------------
// Baseline: failure rate, latency distribution, clustering
// ---------------------------------------------------------------------------

export const LATENCY_EDGES = [0, 25, 50, 100, 250, 500, 1000, 1500, 2000, 2500, 3000, 4000] as const;

export interface EndpointAnalysis {
  n: number;
  failures: Interval & { count: number };
  errors: Record<string, number>;
  okLatency: Summary;
  okTtfb: Summary;
  failLatency: Summary;
  histogram: { bucket: string; ok: number; failed: number }[];
  correlation: Correlation;
  cacheHits: number;
}

export function analyzeEndpoint(samples: readonly Sample[]): EndpointAnalysis {
  const ok = samples.filter((s) => s.ok);
  const failed = samples.filter((s) => !s.ok);

  const errors: Record<string, number> = {};
  for (const s of failed) errors[s.error ?? 'unknown'] = (errors[s.error ?? 'unknown'] ?? 0) + 1;

  const okCounts = histogram(ok.map((s) => s.totalMs), LATENCY_EDGES);
  const failCounts = histogram(failed.map((s) => s.totalMs), LATENCY_EDGES);
  const buckets = LATENCY_EDGES.map((edge, i) => {
    const next = LATENCY_EDGES[i + 1];
    return {
      bucket: next === undefined ? `≥ ${edge}` : `${edge}–${next}`,
      ok: okCounts[i] ?? 0,
      failed: failCounts[i] ?? 0,
    };
  });

  return {
    n: samples.length,
    failures: { count: failed.length, ...wilsonInterval(failed.length, samples.length) },
    errors,
    okLatency: summarize(ok.map((s) => s.totalMs)),
    okTtfb: summarize(ok.flatMap((s) => (s.ttfbMs === null ? [] : [s.ttfbMs]))),
    failLatency: summarize(failed.map((s) => s.totalMs)),
    histogram: buckets,
    correlation: failureCorrelation(samples.map((s) => !s.ok)),
    cacheHits: samples.filter((s) => s.vercelCache === 'HIT').length,
  };
}

// ---------------------------------------------------------------------------
// Concurrency sweep
// ---------------------------------------------------------------------------

export interface ConcurrencyRow {
  runId: string;
  concurrency: number;
  n: number;
  failureRate: Interval;
  okLatency: Summary;
  wallMs: number;
  okPerSec: number;
  status429: number;
  timeouts: number;
}

/** Wall time is reconstructed from the samples themselves: first start → last finish. */
function wallMs(samples: readonly Sample[]): number {
  if (samples.length === 0) return 0;
  const starts = samples.map((s) => Date.parse(s.startedAt));
  const ends = samples.map((s, i) => (starts[i] as number) + s.totalMs);
  return Math.max(...ends) - Math.min(...starts);
}

export function analyzeConcurrency(samples: readonly Sample[]): ConcurrencyRow[] {
  const groups = new Map<string, Sample[]>();
  for (const s of samples) {
    const key = `${s.runId}|${s.concurrency}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()].map((group) => {
    const first = group[0] as Sample;
    const ok = group.filter((s) => s.ok);
    const wall = wallMs(group);
    return {
      runId: first.runId,
      concurrency: first.concurrency,
      n: group.length,
      failureRate: wilsonInterval(group.length - ok.length, group.length),
      okLatency: summarize(ok.map((s) => s.totalMs)),
      wallMs: wall,
      okPerSec: wall > 0 ? ok.length / (wall / 1000) : 0,
      status429: group.filter((s) => s.status === 429).length,
      timeouts: group.filter((s) => s.error === 'timeout').length,
    };
  });
}

// ---------------------------------------------------------------------------
// Full scan (a naive-but-correct end-to-end run)
// ---------------------------------------------------------------------------

export interface ScanAnalysis {
  runId: string;
  concurrency: number;
  wallMs: number;
  requests: number;
  usersEndpointAttempts: number;
  usersAttempted: number;
  usersResolved: number;
  attemptsPerUser: { attempts: number; users: number }[];
  attemptFailureRate: Interval;
}

export function analyzeScan(samples: readonly Sample[]): ScanAnalysis | undefined {
  const first = samples[0];
  if (!first) return undefined;
  const logins = samples.filter((s) => s.endpoint === 'logins');

  const byUser = new Map<number, Sample[]>();
  for (const s of logins) {
    if (s.userId === undefined) continue;
    byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
  }

  const attemptCounts = new Map<number, number>();
  for (const attempts of byUser.values()) attemptCounts.set(attempts.length, (attemptCounts.get(attempts.length) ?? 0) + 1);

  return {
    runId: first.runId,
    concurrency: Math.max(...logins.map((s) => s.concurrency), 1),
    wallMs: wallMs(samples),
    requests: samples.length,
    usersEndpointAttempts: samples.length - logins.length,
    usersAttempted: byUser.size,
    usersResolved: [...byUser.values()].filter((attempts) => attempts.some((s) => s.ok)).length,
    attemptsPerUser: [...attemptCounts.entries()].sort(([a], [b]) => a - b).map(([attempts, users]) => ({ attempts, users })),
    attemptFailureRate: wilsonInterval(logins.filter((s) => !s.ok).length, logins.length),
  };
}

// ---------------------------------------------------------------------------
// Data quality: every assumption the UI would otherwise make silently
// ---------------------------------------------------------------------------

export interface QualityCheck {
  check: string;
  affected: number;
  examples: number[];
  note: string;
}

export interface DataQuality {
  scannedAt: string;
  userCount: number;
  loginsPerUser: Summary;
  earliestLogin?: string;
  latestLogin?: string;
  checks: QualityCheck[];
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isIpv4(ip: unknown): boolean {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** Private, loopback, link-local, CGNAT, multicast/reserved: no meaningful country. */
export function isNonRoutableIpv4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

const blank = (v: unknown) => typeof v !== 'string' || v.trim() === '';

export function analyzeDataset(ds: Dataset): DataQuality {
  const now = Date.parse(ds.scannedAt);
  const checks: QualityCheck[] = [];
  const add = (check: string, ids: number[], note: string) =>
    checks.push({ check, affected: ids.length, examples: ids.slice(0, 5), note });

  // --- /users ---
  const idCounts = new Map<number, number>();
  for (const u of ds.users) idCounts.set(u.id, (idCounts.get(u.id) ?? 0) + 1);
  add('Duplicate user ids', [...idCounts].filter(([, c]) => c > 1).map(([id]) => id), 'Rows keyed by id would collide.');
  add(
    'Non-integer user id',
    ds.users.filter((u) => !Number.isInteger(u.id) || u.id < 1).map((u) => u.id),
    'Would break the logins URL.',
  );
  add(
    'Missing/blank first name, last name or email',
    ds.users.filter((u) => blank(u.first_name) || blank(u.last_name) || blank(u.email)).map((u) => u.id),
    'Name/email cells need a fallback.',
  );
  add(
    'Email fails a basic format check',
    ds.users.filter((u) => !blank(u.email) && !EMAIL.test(u.email)).map((u) => u.id),
    'Display as-is; do not make it a mailto: link blindly.',
  );
  const emailOwners = new Map<string, number[]>();
  for (const u of ds.users) {
    if (blank(u.email)) continue;
    const key = u.email.toLowerCase();
    emailOwners.set(key, [...(emailOwners.get(key) ?? []), u.id]);
  }
  add('Shared email address', [...emailOwners.values()].filter((ids) => ids.length > 1).flat(), 'Email is not a unique key.');

  // --- logins ---
  add(
    'Logins never fetched (unresolved after retries)',
    ds.unresolved.map((u) => u.userId),
    'Excluded from the login checks below.',
  );

  const mismatched: number[] = [];
  const malformed: number[] = [];
  const zero: number[] = [];
  const badTime: number[] = [];
  const lastNotLatest: number[] = [];
  const unsorted: number[] = [];
  const ties: number[] = [];
  const future: number[] = [];
  const badIp: number[] = [];
  const nonRoutable: number[] = [];
  const inactive: number[] = [];
  const counts: number[] = [];
  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;

  for (const u of ds.users) {
    const res = ds.logins[String(u.id)];
    if (!res) continue;
    if (res.user_id !== u.id) mismatched.push(u.id);
    if (!Array.isArray(res.logins)) {
      malformed.push(u.id);
      continue;
    }
    const logins: Login[] = res.logins;
    counts.push(logins.length);
    if (logins.length === 0) {
      zero.push(u.id);
      continue;
    }

    const times = logins.map((l) => (typeof l.login_time === 'string' && ISO_UTC.test(l.login_time) ? Date.parse(l.login_time) : Number.NaN));
    if (times.some(Number.isNaN)) badTime.push(u.id);
    if (logins.some((l) => !isIpv4(l.ip_v4))) badIp.push(u.id);

    const valid = times.filter((t) => !Number.isNaN(t));
    if (valid.length === 0) continue;
    const latest = Math.max(...valid);
    minTime = Math.min(minTime, ...valid);
    maxTime = Math.max(maxTime, latest);

    if (times.at(-1) !== latest) lastNotLatest.push(u.id);
    const asc = valid.every((t, i) => i === 0 || t >= (valid[i - 1] as number));
    const desc = valid.every((t, i) => i === 0 || t <= (valid[i - 1] as number));
    if (!asc && !desc) unsorted.push(u.id);
    if (valid.filter((t) => t === latest).length > 1) ties.push(u.id);
    if (valid.some((t) => t > now)) future.push(u.id);
    if (now - latest >= 30 * DAY_MS) inactive.push(u.id);

    const latestIp = logins[times.indexOf(latest)]?.ip_v4;
    if (isIpv4(latestIp) && isNonRoutableIpv4(latestIp as string)) nonRoutable.push(u.id);
  }

  add('user_id in response ≠ requested id', mismatched, 'Would attach logins to the wrong row.');
  add('logins is not an array', malformed, 'Must be treated as an error state, not "no logins".');
  add('Zero logins', zero, 'Needs a "Never logged in" state; not an error.');
  add('Unparseable / non-ISO login_time', badTime, 'Skip bad entries when choosing the most recent.');
  add('Last item is NOT the most recent login', lastNotLatest, 'Using logins.at(-1) would show the wrong login.');
  add('Logins sorted neither ascending nor descending', unsorted, 'No ordering can be assumed; compute the max.');
  add('Most recent time shared by 2+ logins', ties, 'Which IP to show is ambiguous; pick a stable rule.');
  add('Has a login dated after the scan time', future, 'Humanizer must handle "in N days"; decide if these count.');
  add('Invalid ip_v4', badIp, 'Display raw; skip country lookup.');
  add('Most recent IP is private/reserved', nonRoutable, 'Country lookup (bonus) will have no answer.');
  add('Inactive ≥ 30 days (by most recent login)', inactive, 'Bonus highlight; 30 days approximates "one month".');

  return {
    scannedAt: ds.scannedAt,
    userCount: ds.users.length,
    loginsPerUser: summarize(counts),
    earliestLogin: Number.isFinite(minTime) ? new Date(minTime).toISOString() : undefined,
    latestLogin: Number.isFinite(maxTime) ? new Date(maxTime).toISOString() : undefined,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Measurements → suggested client parameters
// ---------------------------------------------------------------------------

export interface TimeoutOption extends TimeoutCandidate {
  attemptsNeeded: number;
}

export interface SuggestedParameters {
  userCount: number;
  basis: number;
  pFail: Interval;
  maxAttempts: number;
  timeoutOptions: TimeoutOption[];
  bestTimeout?: TimeoutOption;
  bestThroughput?: ConcurrencyRow;
  recommendedConcurrency?: ConcurrencyRow;
  estimatedWallMs?: number;
}

const TIMEOUT_CANDIDATES = [250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, Number.POSITIVE_INFINITY];

export function deriveParameters(
  loginSamples: readonly Sample[],
  concurrencyRows: readonly ConcurrencyRow[],
  userCount: number,
): SuggestedParameters {
  const failed = loginSamples.filter((s) => !s.ok).length;
  const pFail = wilsonInterval(failed, loginSamples.length);
  // Size the retry budget on the pessimistic end of the interval.
  const maxAttempts = attemptsNeeded(pFail.high, userCount);

  const timeoutOptions = timeoutCostCurve(
    loginSamples.map((s) => ({ ms: s.totalMs, ok: s.ok })),
    TIMEOUT_CANDIDATES,
  ).map((c) => ({ ...c, attemptsNeeded: attemptsNeeded(1 - c.pSuccess, userCount) }));

  // Ignore timeouts so tight they fail most attempts: they look cheap but need huge retry budgets.
  const viable = timeoutOptions.filter((o) => o.pSuccess >= 0.5);
  const bestTimeout = viable.reduce<TimeoutOption | undefined>(
    (best, o) => (!best || o.expectedMsPerSuccess < best.expectedMsPerSuccess ? o : best),
    undefined,
  );

  const bestThroughput = concurrencyRows.reduce<ConcurrencyRow | undefined>(
    (best, r) => (!best || r.okPerSec > best.okPerSec ? r : best),
    undefined,
  );
  // Smallest concurrency that gets within 90% of the best: diminishing returns past that,
  // and lower load on a server we don't own.
  const recommendedConcurrency = bestThroughput
    ? [...concurrencyRows]
        .sort((a, b) => a.concurrency - b.concurrency)
        .find((r) => r.okPerSec >= 0.9 * bestThroughput.okPerSec)
    : undefined;

  const estimatedWallMs =
    bestTimeout && recommendedConcurrency
      ? (userCount * bestTimeout.expectedMsPerSuccess) / recommendedConcurrency.concurrency
      : undefined;

  return {
    userCount,
    basis: loginSamples.length,
    pFail,
    maxAttempts,
    timeoutOptions,
    bestTimeout,
    bestThroughput,
    recommendedConcurrency,
    estimatedWallMs,
  };
}
