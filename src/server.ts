import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { config } from './config.ts';

serve({ fetch: createApp().fetch, port: config.port }, ({ port }) => {
  console.log(`condobot ouvindo na porta ${port}`);
});
