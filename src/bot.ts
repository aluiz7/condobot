import { config } from './config.ts';
import { createDebouncer } from './debounce.ts';
import { getHistory, remember } from './history.ts';
import { answer, transcribe, type Answer } from './llm.ts';
import { logInteraction } from './log.ts';
import { isAllowed } from './phone.ts';
import { downloadMedia, sendText, showTyping, type IncomingMessage } from './whatsapp.ts';

export const WELCOME = `Oi! Sou o assistente do Atlantis Park. Tiro dúvidas sobre o condomínio, por texto ou áudio:

• horários da piscina, academia, sauna, correios e administração
• valores e regras dos salões, churrasqueiras e quiosque
• ramais
• regras de obra, mudança, animais, garagem e assembleia

É só perguntar. Ex.: "quanto custa o salão infantil no sábado?"`;

const NOT_SUPPORTED_REPLY = 'Por enquanto eu entendo texto e áudio. Pode escrever ou gravar sua dúvida?';
const AUDIO_ERROR_REPLY = 'Não consegui ouvir esse áudio. Pode mandar de novo ou escrever?';

const GREETING = /^(oi+|ol[aá]|opa|e a[ií]|eai|bom dia|boa tarde|boa noite|tudo bem\??)[\s!.,?]*$/i;
const HELP = /^(ajuda|menu|help|o que voc[eê] faz\??)[\s!.?]*$/i;

// Só cumprimento, sem pergunta: responde com a apresentação fixa, sem gastar uma chamada ao modelo.
export function cannedReply(text: string, hasHistory: boolean): string | undefined {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return undefined;
  if (lines.every((l) => HELP.test(l) || GREETING.test(l)) && lines.some((l) => HELP.test(l))) return WELCOME;
  if (!hasHistory && lines.every((l) => GREETING.test(l))) return WELCOME;
  return undefined;
}

// A Meta reenvia o mesmo evento se não recebe 200 a tempo; guarda os ids recentes para não responder duas vezes.
const seen = new Set<string>();
const SEEN_LIMIT = 1000;

export function isDuplicate(id: string): boolean {
  if (seen.has(id)) return true;
  seen.add(id);
  if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value!);
  return false;
}

// O "digitando…" some sozinho depois de 25 s, e o modelo às vezes demora mais que isso. Renova enquanto espera.
async function whileTyping<T>(messageId: string, work: () => Promise<T>): Promise<T> {
  await showTyping(messageId).catch(() => {});
  const timer = setInterval(() => showTyping(messageId).catch(() => {}), 20_000);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

type Pending = { id: string; text: string; audio: boolean };

const enqueue = createDebouncer<Pending>(config.debounceMs, async (phone, items) => {
  const question = items.map((i) => i.text).join('\n');
  const lastId = items[items.length - 1].id;
  const started = Date.now();
  const history = getHistory(phone);
  const canned = cannedReply(question, history.length > 0);
  const result: Answer = canned
    ? { text: canned, usage: {} }
    : await whileTyping(lastId, () => answer(history, question));
  await sendText(phone, result.text);
  if (!canned && !result.error) remember(phone, question, result.text);

  await logInteraction({
    phone,
    question,
    reply: result.text,
    latencyMs: Date.now() - started,
    usage: result.usage,
    error: result.error,
    audio: items.some((i) => i.audio),
    canned: Boolean(canned),
  });
});

export async function handleMessage(msg: IncomingMessage) {
  if (isDuplicate(msg.id)) return;
  if (!isAllowed(msg.from, config.allowedPhones, config.superAdminPhone)) return;

  await showTyping(msg.id).catch(() => {});

  if (msg.type === 'text' && msg.text) {
    enqueue(msg.from, { id: msg.id, text: msg.text, audio: false });
    return;
  }

  if (msg.type === 'audio' && msg.audio) {
    let text = '';
    try {
      const { id, mimeType } = msg.audio;
      text = await whileTyping(msg.id, async () => transcribe(await downloadMedia(id), mimeType));
    } catch (err) {
      console.error('erro ao transcrever áudio', msg.id, err);
    }
    if (!text) {
      await sendText(msg.from, AUDIO_ERROR_REPLY);
      return;
    }
    enqueue(msg.from, { id: msg.id, text, audio: true });
    return;
  }

  await sendText(msg.from, NOT_SUPPORTED_REPLY);
}
