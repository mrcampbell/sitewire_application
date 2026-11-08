import type { ConcurrencyRow, DataQuality, EndpointAnalysis, ScanAnalysis, SuggestedParameters } from './analysis.js';
import { twoProportionZ, type Interval, type Summary } from './lib/stats.js';

export const fmtMs = (v: number) => {
  if (v === Number.POSITIVE_INFINITY) return '∞';
  if (!Number.isFinite(v)) return '—';
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;
};

export const fmtPct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');

const fmtInterval = (i: Interval) => `${fmtPct(i.estimate)} (95% CI ${fmtPct(i.low)}–${fmtPct(i.high)})`;

export function table(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

const summaryRow = (label: string, s: Summary) => [
  label,
  s.n,
  fmtMs(s.min),
  fmtMs(s.p50),
  fmtMs(s.p90),
  fmtMs(s.p95),
  fmtMs(s.p99),
  fmtMs(s.max),
  fmtMs(s.mean),
];

function clusteringVerdict(a: EndpointAnalysis): string {
  const { pFailAfterFail, pFailAfterOk, nAfterFail, nAfterOk } = a.correlation;
  if (nAfterFail < 10) return 'too few consecutive pairs to judge: collect more samples';
  const z = twoProportionZ(
    Math.round(pFailAfterFail * nAfterFail),
    nAfterFail,
    Math.round(pFailAfterOk * nAfterOk),
    nAfterOk,
  );
  const zText = `z = ${z.toFixed(2)}`;
  if (Math.abs(z) < 1.96) return `no significant clustering (${zText}): consistent with independent failures`;
  return z > 0
    ? `failures cluster (${zText}): back off before retrying`
    : `a failure makes the next request *less* likely to fail (${zText}; unusual, worth a closer look)`;
}

export function renderEndpoint(title: string, a: EndpointAnalysis): string {
  const errors = Object.entries(a.errors)
    .map(([e, n]) => `\`${e}\` ×${n}`)
    .join(', ');
  const { pFail, pFailAfterFail, pFailAfterOk, nAfterFail, nAfterOk } = a.correlation;
  return [
    `### ${title}`,
    '',
    `- Requests: **${a.n}** · failed: **${a.failures.count}** → ${fmtInterval(a.failures)}`,
    `- Failure types: ${errors || 'none'}`,
    ...(a.cacheHits ? [`- Vercel cache HITs: ${a.cacheHits}`] : []),
    `- Clustering: P(fail) ${fmtPct(pFail)} · P(fail | prev failed) ${fmtPct(pFailAfterFail)} (n=${nAfterFail}) · P(fail | prev ok) ${fmtPct(pFailAfterOk)} (n=${nAfterOk}) → ${clusteringVerdict(a)}`,
    '',
    table(
      ['Latency', 'n', 'min', 'p50', 'p90', 'p95', 'p99', 'max', 'mean'],
      [summaryRow('Success (last byte)', a.okLatency), summaryRow('Success (headers)', a.okTtfb), summaryRow('Failure (last byte)', a.failLatency)],
    ),
    '',
    table(
      ['Bucket (ms)', 'Success', 'Failure'],
      a.histogram.filter((b) => b.ok || b.failed).map((b) => [b.bucket, b.ok, b.failed]),
    ),
  ].join('\n');
}

export function renderConcurrency(rows: readonly ConcurrencyRow[]): string {
  return table(
    ['Run', 'Concurrency', 'n', 'Failure rate', 'p50 (ok)', 'p95 (ok)', 'max (ok)', 'Wall', 'OK / s', '429s', 'Timeouts'],
    rows.map((r) => [
      r.runId.slice(0, 19),
      r.concurrency,
      r.n,
      fmtInterval(r.failureRate),
      fmtMs(r.okLatency.p50),
      fmtMs(r.okLatency.p95),
      fmtMs(r.okLatency.max),
      fmtMs(r.wallMs),
      r.okPerSec.toFixed(2),
      r.status429,
      r.timeouts,
    ]),
  );
}

export function renderScan(s: ScanAnalysis): string {
  return [
    `- Run \`${s.runId}\` at concurrency **${s.concurrency}**`,
    `- Wall time: **${fmtMs(s.wallMs)}** for ${s.usersAttempted} users (${s.requests} requests, ${s.usersEndpointAttempts} of them to /users)`,
    `- Resolved: **${s.usersResolved}/${s.usersAttempted}** · per-attempt failure rate ${fmtInterval(s.attemptFailureRate)}`,
    '',
    table(
      ['Attempts used', 'Users'],
      s.attemptsPerUser.map((r) => [r.attempts, r.users]),
    ),
  ].join('\n');
}

export function renderDataQuality(q: DataQuality): string {
  return [
    `- Snapshot taken ${q.scannedAt}: **${q.userCount}** users`,
    `- Logins per user: min ${q.loginsPerUser.min}, median ${q.loginsPerUser.p50}, max ${q.loginsPerUser.max}`,
    `- Login times span ${q.earliestLogin ?? '—'} → ${q.latestLogin ?? '—'}`,
    '',
    table(
      ['Check', 'Users affected', 'Example ids', 'Implication'],
      q.checks.map((c) => [c.check, c.affected ? `**${c.affected}**` : 0, c.examples.join(', ') || '—', c.note]),
    ),
  ].join('\n');
}

export function renderParameters(p: SuggestedParameters): string {
  const lines = [
    `Based on ${p.basis} sequential logins samples and ${p.userCount} users. These are starting points to justify in the app's README, not decisions.`,
    '',
    `- **Retry budget:** per-attempt failure rate ${fmtInterval(p.pFail)}. Using the upper bound, **${p.maxAttempts} attempts** keeps the expected number of users still failing ≤ 0.5 across ${p.userCount}. Retry 5xx/timeouts only, never 4xx.`,
  ];
  if (p.bestTimeout) {
    lines.push(
      `- **Timeout:** lowest expected time per resolved request is at **${fmtMs(p.bestTimeout.timeoutMs)}** (${fmtMs(p.bestTimeout.expectedMsPerSuccess)} per success; ${p.bestTimeout.attemptsNeeded} attempts needed at that timeout). Model assumes attempts are independent and ignores backoff.`,
    );
  }
  if (p.recommendedConcurrency && p.bestThroughput) {
    lines.push(
      `- **Concurrency:** peak throughput ${p.bestThroughput.okPerSec.toFixed(2)} ok/s at ${p.bestThroughput.concurrency}; **${p.recommendedConcurrency.concurrency}** already reaches ≥ 90% of that, so higher adds load for little gain.`,
    );
  }
  if (p.estimatedWallMs !== undefined) {
    lines.push(
      `- **Predicted time to load every user:** ≈ **${fmtMs(p.estimatedWallMs)}** (users × expected time per success ÷ concurrency). Compare against the scan and against the app's own metrics.`,
    );
  }
  lines.push(
    '',
    table(
      ['Timeout', 'P(success per attempt)', 'Mean attempt cost', 'Expected time per success', 'Attempts needed'],
      p.timeoutOptions.map((o) => [
        fmtMs(o.timeoutMs),
        fmtPct(o.pSuccess),
        fmtMs(o.meanAttemptMs),
        fmtMs(o.expectedMsPerSuccess),
        Number.isFinite(o.attemptsNeeded) ? o.attemptsNeeded : '∞',
      ]),
    ),
  );
  return lines.join('\n');
}
