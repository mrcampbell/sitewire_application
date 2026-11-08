import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { RESULTS_DIR } from '../config.js';
import type { Sample } from './http.js';

/** Appends one JSON line per request to results/<probe>-<runId>.ndjson. */
export function createRecorder(probe: string) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(RESULTS_DIR, `${probe}-${runId}.ndjson`);
  return {
    runId,
    file,
    write: (sample: Sample) => appendFileSync(file, `${JSON.stringify(sample)}\n`),
  };
}

/** Terminal progress: one character per request. */
export function tick(sample: Sample, index: number) {
  process.stdout.write(sample.ok ? '.' : sample.error === 'timeout' ? 't' : 'x');
  if ((index + 1) % 50 === 0) process.stdout.write(` ${index + 1}\n`);
}
