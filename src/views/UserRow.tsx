import type { Row } from '../loader.js';
import type { User } from '../types.js';
import { formatLoginTime, fullName } from './format.js';

type UserRowProps = {
  user: User;
  row: Row;
};

export const UserRow = ({ user, row }: UserRowProps) => (
  <tr id={`row-${user.id}`} class="hover:bg-base-200/60">
    <td class="font-mono text-base-content/60 tabular-nums">{user.id}</td>
    <td class="font-medium">{fullName(user)}</td>
    <td class="text-base-content/80">{user.email}</td>
    <LoginCells user={user} row={row} />
  </tr>
);

const LoginCells = ({ user, row }: UserRowProps) => {
  if (row.status === 'pending') {
    return (
      <>
        <td>
          <div class="skeleton h-4 w-40"></div>
        </td>
        <td>
          <div class="skeleton h-4 w-28"></div>
        </td>
      </>
    );
  }

  if (row.status === 'failed') {
    return (
      <td colspan={2}>
        <div class="flex items-center gap-2">
          <span class="tooltip" data-tip={row.error}>
            <span class="badge badge-soft badge-error badge-sm">Couldn't load logins</span>
          </span>
          <form method="post" action={`/users/${user.id}/retry`} data-retry>
            <button type="submit" class="btn btn-ghost btn-xs">
              Retry
            </button>
          </form>
        </div>
      </td>
    );
  }

  if (!row.login) {
    return (
      <>
        <td>
          <span class="badge badge-ghost badge-sm">Never logged in</span>
        </td>
        <td class="text-base-content/40">—</td>
      </>
    );
  }

  return (
    <>
      <td>
        <time datetime={row.login.login_time} class="tabular-nums">
          {formatLoginTime(row.login.login_time)}
        </time>
      </td>
      <td class="font-mono">{row.login.ip_v4}</td>
    </>
  );
};
