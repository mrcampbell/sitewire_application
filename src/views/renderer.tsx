import { jsxRenderer } from 'hono/jsx-renderer';
import { Layout } from './Layout.js';

export const renderer = jsxRenderer(({ children }) => <Layout>{children}</Layout>, { docType: true });
