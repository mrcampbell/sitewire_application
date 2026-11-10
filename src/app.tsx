import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { messageOf } from './api.js';
import { currentLoad } from './loader.js';
import { renderer } from './views/renderer.js';
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

app.post('/users/:id/retry', async (c) => {
  const load = currentLoad();
  const users = await load.users.catch(() => []);
  const user = users.find((u) => u.id === Number(c.req.param('id')));

  if (user) {
    await load.retry(user);
  }

  return c.redirect('/');
});

app.get('/health', (c) => c.json({ ok: true }));
