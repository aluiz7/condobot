// Conversa com o bot pelo terminal, sem WhatsApp nem Meta: mesmo prompt, base, histórico e boas-vindas.
// Serve para testar o fluxo da conversa antes de mexer no webhook. Ctrl+C sai.
import { createInterface } from 'node:readline';
import { cannedReply } from '../src/bot.ts';
import { getHistory, remember } from '../src/history.ts';
import { answer } from '../src/llm.ts';
import { formatNotices, listStatus } from '../src/status.ts';

const phone = 'terminal';
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log('Digite como se fosse no WhatsApp. Ctrl+C para sair.\n');

rl.setPrompt('você > ');
rl.prompt();
for await (const line of rl) {
  const question = line.trim();
  if (!question) {
    rl.prompt();
    continue;
  }
  const started = Date.now();
  const history = getHistory(phone);
  const canned = cannedReply(question, history.length > 0);
  const r = canned ? { text: canned, usage: {}, error: undefined } : await answer(history, question, new Date(), formatNotices(listStatus()));
  if (!canned && !r.error) remember(phone, question, r.text);
  const info = canned ? 'resposta fixa' : `${Date.now() - started} ms, ${r.usage.input ?? 0} tokens (${r.usage.cached ?? 0} em cache)`;
  console.log(`\nbot > ${r.text}\n      [${info}${r.error ? ', ERRO ' + r.error.slice(0, 120) : ''}]\n`);
  rl.prompt();
}
