import { config } from './config.ts';
import { runAdminCommand } from './commands.ts';
import { createDebouncer } from './debounce.ts';
import { getHistory, remember } from './history.ts';
import { answer, transcribe, type Answer } from './llm.ts';
import { logInteraction } from './log.ts';
import { isAllowed, isOneOf } from './phone.ts';
import { handleRegistration, runResidentCommand, type Outgoing } from './registration.ts';
import { formatNotices, listStatus } from './status.ts';
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

// Mensagem que chega enquanto o modelo ainda gera a resposta anterior: a resposta antiga é descartada e a
// pergunta é refeita com tudo junto, em vez de o morador receber duas respostas desencontradas.
const inflight = new Map<string, { gen: number; items: Pending[] }>();
let generation = 0;

const enqueue = createDebouncer<Pending>(config.debounceMs, async (phone, fresh) => {
  const items = [...(inflight.get(phone)?.items ?? []), ...fresh];
  const gen = ++generation;
  inflight.set(phone, { gen, items });

  const question = items.map((i) => i.text).join('\n');
  const lastId = items[items.length - 1].id;
  const started = Date.now();
  const history = getHistory(phone);
  const canned = cannedReply(question, history.length > 0);
  const result: Answer & { tier?: string } = canned
    ? { text: canned, usage: {} }
    : await whileTyping(lastId, () => answer(history, question, new Date(), formatNotices(listStatus())));
  if (inflight.get(phone)?.gen !== gen) return;
  inflight.delete(phone);

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
    tier: result.tier,
  });
});

function wrap(to: string, text: string | undefined): Outgoing[] | undefined {
  return text === undefined ? undefined : [{ to, text }];
}

async function sendAll(out: Outgoing[]) {
  for (const o of out) {
    await sendText(o.to, o.text).catch((err) => console.error('erro ao enviar para', o.to, err));
  }
}

// Conversa de cadastro (e respostas "sim CÓDIGO" do responsável) não passa pelo modelo.
async function route(phone: string, item: Pending) {
  const out = handleRegistration(phone, item.text);
  if (out) await sendAll(out);
  else enqueue(phone, item);
}

export function isAdmin(phone: string): boolean {
  return isOneOf(phone, [config.superAdminPhone, ...config.sindicoPhones]);
}

export async function handleMessage(msg: IncomingMessage) {
  if (isDuplicate(msg.id)) return;
  const admin = isAdmin(msg.from);
  if (!admin && !isAllowed(msg.from, config.allowedPhones, config.superAdminPhone)) {
    console.log('mensagem ignorada: número fora de ALLOWED_PHONES');
    return;
  }

  // Comando da síndica responde na hora, sem esperar outras mensagens nem chamar o modelo.
  if (admin && msg.type === 'text' && msg.text?.trim().startsWith('#')) {
    const out = runResidentCommand(msg.text, msg.from) ?? wrap(msg.from, runAdminCommand(msg.text, msg.from));
    if (out) {
      await sendAll(out);
      return;
    }
  }

  await showTyping(msg.id).catch(() => {});

  if (msg.type === 'text' && msg.text) {
    await route(msg.from, { id: msg.id, text: msg.text, audio: false });
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
    await route(msg.from, { id: msg.id, text, audio: true });
    return;
  }

  await sendText(msg.from, NOT_SUPPORTED_REPLY);
}
