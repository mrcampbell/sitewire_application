/** Shapes as documented in the challenge README. Probes treat them as claims to verify. */
export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

export interface Login {
  login_time: string;
  ip_v4: string;
}

export interface UserLogins {
  user_id: number;
  logins: Login[];
}

/** Snapshot written by the full scan; feeds the data-quality report and the simulator. */
export interface Dataset {
  scannedAt: string;
  baseUrl: string;
  users: User[];
  logins: Record<string, UserLogins>;
  unresolved: { userId: number; lastError: string }[];
}
