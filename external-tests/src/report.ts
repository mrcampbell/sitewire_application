/**
 * Builds results/REPORT.md from every recorded probe run.
 *
 *   npm run report
 */
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { analyzeConcurrency, analyzeDataset, analyzeEndpoint, analyzeScan, deriveParameters } from './analysis.js';
import { BASE_URL, REPORT_FILE, USER_ID_MAX } from './config.js';
import { listResultFiles, loadDataset, loadProbeSamples, loadSamples } from './lib/results.js';
import { fmtMs, renderConcurrency, renderDataQuality, renderEndpoint, renderParameters, renderScan } from './render.js';

const notRun = (script: string) => `_Not run yet: \`npm run ${script}\`._`;

const sample = loadProbeSamples('sample');
const concurrency = loadProbeSamples('concurrency');
const scanFiles = listResultFiles('scan');
const latestScanFile = scanFiles.at(-1);
const scanSamples = latestScanFile ? loadSamples(latestScanFile) : [];
const dataset = loadDataset();

const usersSamples = sample.samples.filter((s) => s.endpoint === 'users');
const loginSamples = sample.samples.filter((s) => s.endpoint === 'logins');
const concurrencyRows = analyzeConcurrency(concurrency.samples);
const scan = analyzeScan(scanSamples);
const userCount = dataset?.users.length ?? USER_ID_MAX;

const stalled = [...sample.stalled, ...concurrency.stalled];
const stallNote = stalled.length
  ? [
      `> **Excluded ${stalled.length} sample(s)** that outlived the client's own timeout, meaning the client process was suspended (e.g. laptop sleep), not the API being slow:`,
      ...stalled.map((s) => `> \`${s.probe}\` ${s.startedAt} ${s.path}: ${fmtMs(s.totalMs)}`),
      '',
    ]
  : [];

const sources = [...sample.files, ...concurrency.files, ...(latestScanFile ? [latestScanFile] : [])].map(
  (f) => `\`${basename(f)}\``,
);

const report = [
  '# Fake Users API: measurement report',
  '',
  `Generated ${new Date().toISOString()} against \`${dataset?.baseUrl ?? BASE_URL}\`.`,
  `Sources: ${sources.join(', ') || 'none'}.`,
  '',
  '> Latencies are measured from this client, so they include network round-trip time to the Vercel region.',
  '> They describe what *this* app will experience from here, not pure server time.',
  '',
  ...stallNote,
  '## 1. Baseline: sequential, no retries',
  '',
  usersSamples.length ? renderEndpoint('GET /users', analyzeEndpoint(usersSamples)) : notRun('probe:sample'),
  '',
  loginSamples.length ? renderEndpoint('GET /users/:id/relationships/logins', analyzeEndpoint(loginSamples)) : '',
  '',
  '## 2. Concurrency sweep: logins endpoint, no retries',
  '',
  concurrencyRows.length ? renderConcurrency(concurrencyRows) : notRun('probe:concurrency'),
  '',
  '## 3. Full scan: bounded concurrency + retries (baseline strategy)',
  '',
  scan ? renderScan(scan) : notRun('probe:scan'),
  '',
  '## 4. Data quality',
  '',
  dataset ? renderDataQuality(analyzeDataset(dataset)) : notRun('probe:scan'),
  '',
  '## 5. Suggested client parameters',
  '',
  loginSamples.length ? renderParameters(deriveParameters(loginSamples, concurrencyRows, userCount)) : notRun('probe:sample'),
  '',
].join('\n');

writeFileSync(REPORT_FILE, report);
console.log(report);
console.log(`\nWrote ${REPORT_FILE}`);
