import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { HomePage } from './views/HomePage.js';
import { renderer } from './views/renderer.js';

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
app.get('/', (c) => c.render(<HomePage />));
app.get('/health', (c) => c.json({ ok: true }));
