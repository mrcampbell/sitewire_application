export type User = { id: number; first_name: string; last_name: string; email: string };

export type Login = { login_time: string; ip_v4: string };

export type UserLogins = { user_id: number; logins: Login[] };
