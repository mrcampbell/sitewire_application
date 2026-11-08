import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASET_FILE, RESULTS_DIR } from '../config.js';
import type { Dataset } from '../types.js';
import type { Sample } from './http.js';

/** Result files for a probe, oldest first (run ids are ISO timestamps, so they sort). */
export function listResultFiles(probe: string): string[] {
  if (!existsSync(RESULTS_DIR)) return [];
  return readdirSync(RESULTS_DIR)
    .filter((f) => f.startsWith(`${probe}-`) && f.endsWith('.ndjson'))
    .sort()
    .map((f) => join(RESULTS_DIR, f));
}

export function loadSamples(file: string): Sample[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Sample);
}

export function loadProbeSamples(probe: string): { files: string[]; samples: Sample[] } {
  const files = listResultFiles(probe);
  return { files, samples: files.flatMap(loadSamples) };
}

export function loadDataset(): Dataset | undefined {
  return existsSync(DATASET_FILE) ? (JSON.parse(readFileSync(DATASET_FILE, 'utf8')) as Dataset) : undefined;
}
