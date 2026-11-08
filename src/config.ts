export const config = {
  port: Number(process.env.PORT ?? 3000),
  apiBaseUrl: (process.env.API_BASE_URL ?? 'https://fake-users-api.vercel.app').replace(/\/+$/, ''),
};
