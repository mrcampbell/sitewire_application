import type { Child } from 'hono/jsx';
import type { Counts, Row } from '../loader.js';
import type { User } from '../types.js';
import { ErrorIcon } from './icons.js';
import { LoadStatus } from './LoadStatus.js';
import { StatsBar } from './StatsBar.js';
import { UsersTable } from './UsersTable.js';

const PageHeader = () => (
  <header>
    <h1 class="text-2xl font-semibold">Users</h1>
    <p class="text-sm text-base-content/60">Each user's most recent login.</p>
  </header>
);

const Page = ({ children }: { children?: Child }) => (
  <div class="space-y-4">
    <PageHeader />
    {children}
  </div>
);

type UsersPageProps = {
  users: User[];
  rows: ReadonlyMap<number, Row>;
  counts: Counts;
};

export const UsersPage = ({ users, rows, counts }: UsersPageProps) => (
  <Page>
    <StatsBar counts={counts} />
    <LoadStatus counts={counts} />
    <UsersTable users={users} rows={rows} />
  </Page>
);

export const UsersUnavailable = ({ message }: { message: string }) => (
  <Page>
    <div role="alert" class="alert alert-error alert-soft">
      <ErrorIcon />
      <div>
        <h2 class="font-medium">Couldn't load the user list</h2>
        <p class="text-sm text-base-content/70">The API didn't respond successfully after several attempts ({message}).</p>
      </div>
      <a href="/" class="btn btn-sm">
        Try again
      </a>
    </div>
  </Page>
);
