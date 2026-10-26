import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.VERIFY_TOKEN = 'token-de-teste';
process.env.APP_SECRET = 'segredo';

const { createApp } = await import('../src/app.ts');
const { extractMessages } = await import('../src/whatsapp.ts');
const { isDuplicate } = await import('../src/bot.ts');

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            messages: [{ id: 'wamid.1', from: '5521999990000', type: 'text', text: { body: 'Que horas fecha o correio?' } }],
          },
        },
      ],
    },
  ],
};

function sign(body: string) {
  return 'sha256=' + createHmac('sha256', 'segredo').update(body).digest('hex');
}

test('verificação do webhook devolve o challenge com o token certo', async () => {
  const app = createApp(async () => {});
  const ok = await app.request('/webhook?hub.mode=subscribe&hub.verify_token=token-de-teste&hub.challenge=123');
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '123');
  const bad = await app.request('/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123');
  assert.equal(bad.status, 403);
});

test('POST com assinatura válida entrega a mensagem ao handler', async () => {
  const received: string[] = [];
  const app = createApp(async (m) => {
    received.push(m.text ?? '');
  });
  const body = JSON.stringify(payload);
  const res = await app.request('/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } });
  assert.equal(res.status, 200);
  assert.deepEqual(received, ['Que horas fecha o correio?']);
});

test('POST com assinatura inválida é recusado', async () => {
  const app = createApp(async () => assert.fail('não deveria processar'));
  const res = await app.request('/webhook', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) },
  });
  assert.equal(res.status, 401);
});

test('eventos de status de entrega não viram mensagens', () => {
  const statusOnly = { entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'delivered' }] } }] }] };
  assert.deepEqual(extractMessages(statusOnly), []);
});

test('mesma mensagem reenviada pela Meta é ignorada', () => {
  assert.equal(isDuplicate('wamid.dup'), false);
  assert.equal(isDuplicate('wamid.dup'), true);
});
