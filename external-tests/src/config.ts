import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Point at the simulator (e.g. http://localhost:4000) to run probes offline. */
export const BASE_URL = (process.env.API_BASE_URL ?? 'https://fake-users-api.vercel.app').replace(/\/+$/, '');

/**
 * Deliberately generous: probes measure the *true* latency tail, so they must not
 * censor it with a tight timeout. Choosing the app's timeout is an output of the report.
 */
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 15_000);

/** /users currently returns ids 1..1000; probes sample logins uniformly from this range. */
export const USER_ID_MAX = Number(process.env.USER_ID_MAX ?? 1000);

/** Politeness cap: this is a shared interview server, not ours to load-test. */
export const MAX_CONCURRENCY = 50;

export const USER_AGENT = 'sitewire-challenge-external-tests';

export const RESULTS_DIR = fileURLToPath(new URL('../results/', import.meta.url));
export const DATASET_FILE = join(RESULTS_DIR, 'dataset.json');
export const REPORT_FILE = join(RESULTS_DIR, 'REPORT.md');
