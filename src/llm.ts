import { GoogleGenAI, type ThinkingLevel } from '@google/genai';
import { config } from './config.ts';
import { loadKnowledge, type Tier } from './knowledge.ts';
import { pickTier } from './router.ts';
import { SYSTEM_PROMPT } from './prompt.ts';
import type { Turn } from './history.ts';

export type Answer = {
  text: string;
  usage: { input?: number; cached?: number; output?: number; thoughts?: number };
  error?: string;
  // Por que o modelo parou (STOP, MAX_TOKENS, SAFETY...). Ajuda a entender resposta vazia.
  finish?: string;
};

export const ERROR_REPLY =
  'Tive um problema para responder agora. Tenta de novo daqui a pouco ou fale com a administração pelo ramal 90.';

let client: GoogleGenAI | undefined;
const instructions = new Map<Tier, string>();

// Quando a base parcial não basta, o modelo responde só isto e a chamada é refeita com a base completa.
export const NEEDS_DOCS = '[PRECISO_DOS_DOCUMENTOS]';

function getClient() {
  client ??= new GoogleGenAI({ apiKey: config.gemini.apiKey() });
  return client;
}

// A base vai no system prompt, sempre na mesma ordem: as versões menores são o começo da maior, então o
// cache implícito do Gemini reaproveita o prefixo comum. O aviso de documentos ausentes fica no fim.
function systemFor(tier: Tier): string {
  let text = instructions.get(tier);
  if (!text) {
    const missing =
      tier === 'completa'
        ? ''
        : `\n\nNESTA CONVERSA a base acima não inclui ${tier === 'essencial' ? 'o regimento interno nem a convenção' : 'a convenção'}. Se a resposta depender de ${tier === 'essencial' ? 'algum deles' : 'dela'} (regras, multas, assembleia, direitos), responda apenas ${NEEDS_DOCS}, sem mais nada.`;
    text = `${SYSTEM_PROMPT}\n\n<base>\n${loadKnowledge(tier)}\n</base>${missing}`;
    instructions.set(tier, text);
  }
  return text;
}

export function describeNow(now: Date): string {
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  return `[Agora: ${formatted}, horário de Brasília]`;
}

// 503 ("high demand") é comum e passageiro: em vez de esperar, tenta na hora o modelo reserva.
// 429 (cota) não adianta repetir, e repetir ainda gasta mais cota.
async function withFallback<T>(fn: (model: string) => Promise<T>): Promise<T> {
  try {
    return await fn(config.gemini.model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!config.gemini.fallbackModel || !/"code":\s*503|UNAVAILABLE/.test(msg)) throw err;
    return await fn(config.gemini.fallbackModel);
  }
}

// Na base essencial a resposta é consultar uma tabela: vai sem thinkingConfig, que no Flash Lite já sai sem
// raciocínio (medido: 0 tokens de raciocínio e ~3 s a menos que com MINIMAL). Nas regras, MINIMAL inventava
// itens do regimento na avaliação, então lá fica o nível configurado.
function thinkingFor(model: string, tier: Tier) {
  if (model.startsWith('gemini-2')) return { thinkingBudget: config.gemini.thinkingBudget };
  if (tier === 'essencial') return undefined;
  return { thinkingLevel: config.gemini.thinkingLevel.toUpperCase() as ThinkingLevel };
}

async function generate(model: string, history: Turn[], prompt: string, tier: Tier) {
  const res = await getClient().models.generateContent({
    model,
    contents: [
      ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      { role: 'user', parts: [{ text: prompt }] },
    ],
    config: { systemInstruction: systemFor(tier), temperature: 0.2, thinkingConfig: thinkingFor(model, tier) },
  });
  return {
    text: res.text?.trim() ?? '',
    finish: res.candidates?.[0]?.finishReason as string | undefined,
    usage: {
      input: res.usageMetadata?.promptTokenCount,
      cached: res.usageMetadata?.cachedContentTokenCount,
      output: res.usageMetadata?.candidatesTokenCount,
      thoughts: res.usageMetadata?.thoughtsTokenCount,
    },
  };
}

// notices: avisos da administração no momento (status das áreas), enviados junto com a pergunta.
export async function answer(history: Turn[], question: string, now = new Date(), notices = '', tier?: Tier): Promise<Answer & { tier: Tier }> {
  const chosen = tier ?? pickTier(question, history);
  const prompt = [describeNow(now), notices, question].filter(Boolean).join('\n');
  try {
    let r = await withFallback((model) => generate(model, history, prompt, chosen));
    // O Flash Lite às vezes termina sem texto nenhum. Uma nova tentativa no modelo reserva costuma resolver.
    if (!r.text) r = await generate(config.gemini.fallbackModel || config.gemini.model, history, prompt, chosen);
    if (r.text.includes(NEEDS_DOCS) && chosen !== 'completa') {
      const full = await answer(history, question, now, notices, 'completa');
      return { ...full, usage: { input: (r.usage.input ?? 0) + (full.usage.input ?? 0), cached: full.usage.cached, output: full.usage.output } };
    }
    if (!r.text) return { text: ERROR_REPLY, usage: r.usage, error: 'resposta vazia', finish: r.finish, tier: chosen };
    return { text: r.text, usage: r.usage, finish: r.finish, tier: chosen };
  } catch (err) {
    return { text: ERROR_REPLY, usage: {}, error: err instanceof Error ? err.message : String(err), tier: chosen };
  }
}

// Áudio vira texto antes de tudo: assim o histórico, o log e a resposta tratam a pergunta como se fosse escrita.
export async function transcribe(audio: Buffer, mimeType: string): Promise<string> {
  const res = await withFallback((model) =>
    getClient().models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audio.toString('base64') } },
            { text: 'Transcreva este áudio em português, exatamente como foi falado. Responda só com a transcrição.' },
          ],
        },
      ],
      config: { temperature: 0 },
    }),
  );
  return res.text?.trim() ?? '';
}
