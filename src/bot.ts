import { config } from './config.ts';
import { getHistory, remember } from './history.ts';
import { answer } from './llm.ts';
import { logInteraction } from './log.ts';
import { isAllowed } from './phone.ts';
import { markAsRead, sendText, type IncomingMessage } from './whatsapp.ts';

const NOT_TEXT_REPLY = 'Por enquanto eu só entendo mensagens de texto. Pode escrever sua dúvida?';

// A Meta reenvia o mesmo evento se não recebe 200 a tempo; guarda os ids recentes para não responder duas vezes.
const seen = new Set<string>();
const SEEN_LIMIT = 1000;

export function isDuplicate(id: string): boolean {
  if (seen.has(id)) return true;
  seen.add(id);
  if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value!);
  return false;
}

export async function handleMessage(msg: IncomingMessage) {
  if (isDuplicate(msg.id)) return;
  if (!isAllowed(msg.from, config.allowedPhones, config.superAdminPhone)) return;

  await markAsRead(msg.id).catch(() => {});

  if (msg.type !== 'text' || !msg.text) {
    await sendText(msg.from, NOT_TEXT_REPLY);
    return;
  }

  const started = Date.now();
  const result = await answer(getHistory(msg.from), msg.text);
  await sendText(msg.from, result.text);
  if (!result.error) remember(msg.from, msg.text, result.text);

  await logInteraction({
    phone: msg.from,
    question: msg.text,
    reply: result.text,
    latencyMs: Date.now() - started,
    usage: result.usage,
    error: result.error,
  });
}
