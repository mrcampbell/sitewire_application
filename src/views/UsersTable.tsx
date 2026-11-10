import type { Row } from '../loader.js';
import type { User } from '../types.js';
import { UserRow } from './UserRow.js';

type UsersTableProps = {
  users: User[];
  rows: ReadonlyMap<number, Row>;
};

export const UsersTable = ({ users, rows }: UsersTableProps) => (
  <div class="max-h-[70vh] overflow-auto rounded-box border border-base-300 bg-base-100">
    <table class="table table-sm table-pin-rows">
      <thead>
        <tr>
          <th class="w-16">ID</th>
          <th>Name</th>
          <th>Email</th>
          <th>Last login</th>
          <th>IP address</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <UserRow user={user} row={rows.get(user.id) ?? { status: 'pending' }} />
        ))}
      </tbody>
    </table>
  </div>
);
