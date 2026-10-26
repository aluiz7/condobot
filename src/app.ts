import { Hono } from 'hono';
import { config } from './config.ts';
import { handleMessage } from './bot.ts';
import { extractMessages, verifySignature } from './whatsapp.ts';

export function createApp(handler = handleMessage) {
  const app = new Hono();

  app.get('/health', (c) => c.text('ok'));

  // Verificação feita pela Meta ao cadastrar o webhook.
  app.get('/webhook', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');
    if (mode === 'subscribe' && token === config.whatsapp.verifyToken() && challenge) return c.text(challenge);
    return c.text('forbidden', 403);
  });

  app.post('/webhook', async (c) => {
    const raw = await c.req.text();
    const { appSecret } = config.whatsapp;
    if (appSecret && !verifySignature(raw, c.req.header('x-hub-signature-256'), appSecret)) {
      return c.text('invalid signature', 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.text('bad request', 400);
    }

    // Responde 200 na hora e processa depois: a Meta reenvia o evento se a resposta demorar.
    for (const msg of extractMessages(payload)) {
      handler(msg).catch((err) => console.error('erro ao processar mensagem', msg.id, err));
    }
    return c.text('ok');
  });

  return app;
}
