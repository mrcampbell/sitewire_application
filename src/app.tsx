import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Child } from 'hono/jsx';
import { logger } from 'hono/logger';
import { streamSSE } from 'hono/streaming';
import { messageOf } from './api.js';
import { currentLoad, type Row } from './loader.js';
import type { User } from './types.js';
import { LoadSummary } from './views/LoadSummary.js';
import { renderer } from './views/renderer.js';
import { UserRow } from './views/UserRow.js';
import { UsersPage, UsersUnavailable } from './views/UsersPage.js';

export const app = new Hono();

/* NOTE: while I normally add more plugins for public applications
 such as CORS, rate-limiter, Zod (dependent on complexity), they 
 seemed out of the scope of the project, while logging was useful
 for me.

 Historically, I would also inject context vars like DB, cache, 
 user from JWT, but have been more thoughtful about what "comes for free"
 vs. making explicit calls within the handlers for a singleton DB ref, 
 as clarity can be better. Again, trade-offs.
*/
app.use(logger());
app.use(renderer);

/* NOTE: I always extract my router/renders to a nested folder, 
  grouped by path, and at times subject matter. I apply them with `app`
  as the only parameter. Again, overkill, so just adding inline. 
*/
app.get('/', async (c) => {
  const load = currentLoad();

  try {
    const users = await load.users;
    return c.render(<UsersPage users={users} rows={load.rows} counts={load.counts()} />);
  } catch (err) {
    c.status(502);
    return c.render(<UsersUnavailable message={messageOf(err)} />);
  }
});

app.get('/events', (c) =>
  streamSSE(c, async (stream) => {
    const load = currentLoad({ allowStale: true });
    const users = await load.users.catch(() => []);

    let outbox = Promise.resolve();
    const send = (event: string, html: Child) => {
      outbox = outbox.then(async () => {
        await stream.writeSSE({ event, data: String(await html) });
      });
    };
    const sendRow = (user: User, row: Row) => send('row', <UserRow user={user} row={row} />);
    const sendSummary = () => send('status', <LoadSummary counts={load.counts()} />);

    const unsubscribe = load.subscribe((user, row) => {
      sendRow(user, row);
      sendSummary();
    });

    for (const user of users) {
      const row = load.rows.get(user.id);
      if (row && row.status !== 'pending') {
        sendRow(user, row);
      }
    }
    sendSummary();

    await new Promise<void>((resolve) => stream.onAbort(resolve));
    unsubscribe();
  }),
);

app.post('/users/:id/retry', async (c) => {
  const load = currentLoad({ allowStale: true });
  const users = await load.users.catch(() => []);
  const user = users.find((u) => u.id === Number(c.req.param('id')));

  if (user) {
    await load.retry(user);
  }

  return c.redirect('/');
});

app.get('/users.js', serveStatic({ path: './public/users.js' }));
app.get('/health', (c) => c.json({ ok: true }));
