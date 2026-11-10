import type { Login } from './types.js';

/* NOTE: domain might be a stretch for the simple client, but it is an extension of the types
that I often reach for, setting myself up to succeed as the app grows in complexity */
export const latestLogin = (logins: Login[]): Login | null =>
  logins.reduce<Login | null>(
    (latest, login) => (!latest || Date.parse(login.login_time) > Date.parse(latest.login_time) ? login : latest),
    null,
  );
