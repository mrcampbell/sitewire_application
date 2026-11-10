import { getLatestLogin, getUsers, messageOf } from './api.js';
import { config } from './config.js';
import type { Login, User } from './types.js';

export type Row =
  | { status: 'pending' }
  | { status: 'loaded'; login: Login | null }
  | { status: 'failed'; error: string };

export type Counts = ReturnType<Load['counts']>;

type Listener = (user: User, row: Row) => void;

export class Load {
  // NOTE: to be frank, readonly for me is less about data mutation and more about 
  // documentation. But it conveys that the variable has already been set, or is set at
  // construction time. Sure, it provides compiler benefits, but it can also improve usability
  readonly startedAt = Date.now();
  readonly rows = new Map<number, Row>();
  readonly users: Promise<User[]>;
  readonly done: Promise<void>;
  finishedAt?: number;
  failed = false;
  private listeners = new Set<Listener>();

  constructor() {
    this.users = getUsers();
    this.done = this.run();
  }

  get isStale() {
    return this.finishedAt !== undefined && Date.now() - this.finishedAt > config.loader.maxAgeMs;
  }

  counts() {
    const counts = { total: this.rows.size, pending: 0, loaded: 0, failed: 0 };

    for (const row of this.rows.values()) {
      counts[row.status]++;
    }

    return counts;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  retry(user: User) {
    this.setRow(user, { status: 'pending' });
    return this.loadUser(user);
  }

  private async run() {
    try {
      await this.loadAll(await this.users);
    } catch {
      this.failed = true;
    } finally {
      this.finishedAt = Date.now();
    }
  }

  private async loadAll(users: User[]) {
    for (const user of users) {
      this.rows.set(user.id, { status: 'pending' });
    }

    const queue = [...users];
    const worker = async () => {
      for (let user = queue.shift(); user; user = queue.shift()) {
        await this.loadUser(user);
      }
    };

    await Promise.all(Array.from({ length: config.loader.concurrency }, worker));
  }

  private async loadUser(user: User) {
    try {
      const login = await getLatestLogin(user.id);
      this.setRow(user, { status: 'loaded', login });
    } catch (err) {
      this.setRow(user, { status: 'failed', error: messageOf(err) });
    }
  }

  private setRow(user: User, row: Row) {
    this.rows.set(user.id, row);

    for (const listener of this.listeners) {
      listener(user, row);
    }
  }
}

let current: Load | undefined;

export function currentLoad({ allowStale = false } = {}): Load {
  if (!current || current.failed || (current.isStale && !allowStale)) {
    current = new Load();
  }

  return current;
}
