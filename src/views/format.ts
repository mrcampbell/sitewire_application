import type { User } from '../types.js';

const loginTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export const formatLoginTime = (iso: string) => `${loginTimeFormat.format(new Date(iso))} UTC`;

export const fullName = (user: User) => `${user.first_name} ${user.last_name}`;
