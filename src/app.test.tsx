import { describe, expect, it } from 'vitest';
import { app } from './app.js';

describe('app', () => {
  it('renders the home page inside the layout', async () => {
    const res = await app.request('/');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('daisyui@5');
    expect(html).toContain('<th>Last login</th>');
  });

  it('reports health', async () => {
    const res = await app.request('/health');
    expect(await res.json()).toEqual({ ok: true });
  });
});
