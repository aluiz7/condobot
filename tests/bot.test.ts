import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Graph API falsa: registra tudo que o bot mandaria para a Meta.
const calls: any[] = [];
const graph = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    calls.push({ url: req.url, body: body ? JSON.parse(body) : undefined });
    res.setHeader('content-type', 'application/json');
    res.end('{}');
  });
});
await new Promise<void>((r) => graph.listen(0, r));
after(() => graph.close());

process.env.GRAPH_BASE_URL = `http://127.0.0.1:${(graph.address() as any).port}`;
process.env.ACCESS_TOKEN = 'x';
process.env.PHONE_NUMBER_ID = '123';
process.env.VERIFY_TOKEN = 'v';
process.env.APP_SECRET = '';
process.env.DEBOUNCE_MS = '100';
process.env.ALLOWED_PHONES = '5521900000001,5521900000002';
process.env.SINDICO_PHONES = '5521977770000';
process.env.DATA_DIR = ':memory:';
process.env.LOG_DIR = mkdtempSync(join(tmpdir(), 'condobot-'));

const { createApp } = await import('../src/app.ts');
const { cannedReply, WELCOME } = await import('../src/bot.ts');
const { createDebouncer } = await import('../src/debounce.ts');
const { extractMessages } = await import('../src/whatsapp.ts');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function webhook(id: string, from: string, message: object) {
  return {
    method: 'POST',
    body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id, from, ...message }] } }] }] }),
  };
}

const sent = () => calls.filter((c) => c.body?.type === 'text');

test('cumprimento sozinho recebe a apresentação, sem chamar o modelo', () => {
  assert.equal(cannedReply('oi', false), WELCOME);
  assert.equal(cannedReply('Bom dia!\nopa', false), WELCOME);
  assert.equal(cannedReply('oi', true), undefined);
  assert.equal(cannedReply('menu', true), WELCOME);
  assert.equal(cannedReply('oi\nquanto custa o salão?', false), undefined);
});

test('debounce junta mensagens em sequência e entrega uma vez', async () => {
  const flushed: string[][] = [];
  const push = createDebouncer<string>(50, async (_k, items) => {
    flushed.push(items);
  });
  push('a', '1');
  push('a', '2');
  push('b', 'x');
  await wait(20);
  push('a', '3');
  await wait(120);
  assert.deepEqual(flushed, [['x'], ['1', '2', '3']]);
});

test('extrai áudio do payload', () => {
  const [m] = extractMessages({
    entry: [{ changes: [{ value: { messages: [{ id: 'w', from: '55', type: 'audio', audio: { id: 'm1', mime_type: 'audio/ogg; codecs=opus' } }] } }] }],
  });
  assert.deepEqual(m.audio, { id: 'm1', mimeType: 'audio/ogg; codecs=opus' });
});

test('fluxo completo: "oi" + "bom dia" picados viram uma resposta só, com digitando antes', async () => {
  calls.length = 0;
  const app = createApp();
  await app.request('/webhook', webhook('w1', '5521900000001', { type: 'text', text: { body: 'oi' } }));
  await app.request('/webhook', webhook('w2', '5521900000001', { type: 'text', text: { body: 'bom dia' } }));
  await wait(300);

  assert.equal(sent().length, 1);
  assert.equal(sent()[0].body.text.body, WELCOME);
  assert.equal(sent()[0].body.to, '5521900000001');
  const typing = calls.filter((c) => c.body?.typing_indicator);
  assert.ok(typing.length >= 2, 'mostra digitando em cada mensagem recebida');
  assert.ok(calls.indexOf(typing[0]) < calls.indexOf(sent()[0]), 'digitando vem antes da resposta');
});

test('mensagem repetida pela Meta é ignorada e imagem recebe aviso', async () => {
  calls.length = 0;
  const app = createApp();
  await app.request('/webhook', webhook('w3', '5521900000002', { type: 'image', image: { id: 'i' } }));
  await app.request('/webhook', webhook('w3', '5521900000002', { type: 'image', image: { id: 'i' } }));
  await wait(200);
  assert.equal(sent().length, 1);
  assert.match(sent()[0].body.text.body, /texto e áudio/);
});

test('comando da síndica responde na hora, mesmo sem o nono dígito; número fora da allowlist é ignorado', async () => {
  calls.length = 0;
  const app = createApp();
  await app.request('/webhook', webhook('w4', '552177770000', { type: 'text', text: { body: '#fechar quiosque: dedetização' } }));
  await wait(50);
  assert.equal(sent().length, 1, 'responde antes do debounce');
  assert.match(sent()[0].body.text.body, /Quiosque: fechada/);

  calls.length = 0;
  await app.request('/webhook', webhook('w5', '5521900000003', { type: 'text', text: { body: '#abrir quiosque' } }));
  await wait(200);
  assert.equal(sent().length, 0, 'número fora da allowlist nem é respondido');
});
