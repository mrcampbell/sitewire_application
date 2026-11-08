import { createServer, type Server } from 'node:http';
import type { Endpoint } from '../src/lib/http.js';
import { sleep, type Rng } from '../src/lib/random.js';
import type { User, UserLogins } from '../src/types.js';

/** Returns a delay in ms for one response. */
export type LatencyModel = (endpoint: Endpoint, failed: boolean) => number;

export interface SimOptions {
  users: User[];
  logins: Map<number, UserLogins>;
  /** Probability a logins request returns 500. */
  failRate: number;
  /** Probability GET /users returns 500. Defaults to failRate; set to 1 to demo the page-level error state. */
  usersFailRate?: number;
  latency: LatencyModel;
  rng?: Rng;
  log?: boolean;
}

const FAILURE_BODY = JSON.stringify({ message: 'Something went wrong.' });
const LOGINS_ROUTE = /^\/users\/([^/]+)\/relationships\/logins$/;

/**
 * A stand-in for https://fake-users-api.vercel.app that reproduces every behaviour
 * observed by the probes and contract tests:
 *   - random 500s with the same body, delayed like real failures
 *   - 404 + message for unknown ids
 *   - 200 with an EMPTY body for ids that aren't positive integers (e.g. 0, "abc")
 *   - CORS: access-control-allow-origin *
 */
export function createSimServer(opts: SimOptions): Server {
  const rng = opts.rng ?? Math.random;
  const usersBody = JSON.stringify(opts.users);

  return createServer(async (req, res) => {
    const t0 = performance.now();
    const url = new URL(req.url ?? '/', 'http://sim.local');

    const send = (status: number, body: string) => {
      res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(body);
      if (opts.log) console.log(`${req.method} ${url.pathname} ${status} ${Math.round(performance.now() - t0)}ms`);
    };

    if (req.method !== 'GET') return send(405, JSON.stringify({ message: 'Method not allowed' }));

    let endpoint: Endpoint;
    let failRate: number;
    let respond: () => [number, string];

    if (url.pathname === '/users') {
      endpoint = 'users';
      failRate = opts.usersFailRate ?? opts.failRate;
      respond = () => [200, usersBody];
    } else {
      const match = LOGINS_ROUTE.exec(url.pathname);
      if (!match) return send(404, JSON.stringify({ message: 'Not found' }));
      const raw = decodeURIComponent(match[1] ?? '');
      endpoint = 'logins';
      failRate = opts.failRate;
      respond = () => {
        if (!/^[1-9]\d*$/.test(raw)) return [200, ''];
        const logins = opts.logins.get(Number(raw));
        return logins ? [200, JSON.stringify(logins)] : [404, JSON.stringify({ message: `Could not find a user with ID '${raw}'` })];
      };
    }

    const failed = rng() < failRate;
    await sleep(Math.max(0, opts.latency(endpoint, failed)));
    const [status, body] = failed ? [500, FAILURE_BODY] : respond();
    send(status, body);
  });
}
