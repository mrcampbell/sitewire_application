import { loadDataset } from '../src/lib/results.js';
import { pick, randomInt, type Rng } from '../src/lib/random.js';
import type { Login, User, UserLogins } from '../src/types.js';

export interface SimData {
  source: string;
  users: User[];
  logins: Map<number, UserLogins>;
}

/** Real snapshot from `npm run probe:scan` if present, otherwise synthetic data. */
export function loadSimData(rng: Rng, now = Date.now()): SimData {
  const dataset = loadDataset();
  if (dataset) {
    const logins = new Map<number, UserLogins>();
    for (const [id, value] of Object.entries(dataset.logins)) logins.set(Number(id), value);
    // Users the scan couldn't resolve still exist; give them an empty login list.
    for (const { userId } of dataset.unresolved) logins.set(userId, { user_id: userId, logins: [] });
    return { source: `results/dataset.json (${dataset.scannedAt})`, users: dataset.users, logins };
  }
  return { source: 'synthetic', ...syntheticData(rng, 1000, now) };
}

const FIRST = ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Donald', 'Radia', 'Ken', 'Frances', 'Linus'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Dijkstra', 'Liskov', 'Knuth', 'Perlman', 'Thompson', 'Allen', 'Torvalds'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Same quirks as the real data: unsorted logins, some users with none, a few future dates. */
export function syntheticData(rng: Rng, count: number, now: number): Omit<SimData, 'source'> {
  const users: User[] = [];
  const logins = new Map<number, UserLogins>();
  for (let id = 1; id <= count; id++) {
    const first = pick(rng, FIRST);
    const last = pick(rng, LAST);
    users.push({ id, first_name: first, last_name: last, email: `${first[0]}${last}${id}@example.com`.toLowerCase() });

    const n = rng() < 0.03 ? 0 : randomInt(rng, 1, 6);
    const list: Login[] = Array.from({ length: n }, () => ({
      login_time: new Date(now - randomInt(rng, -30, 400) * DAY_MS - randomInt(rng, 0, DAY_MS)).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      ip_v4: Array.from({ length: 4 }, () => randomInt(rng, 1, 254)).join('.'),
    }));
    logins.set(id, { user_id: id, logins: list });
  }
  return { users, logins };
}
