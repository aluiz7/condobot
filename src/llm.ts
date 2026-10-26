import { GoogleGenAI, type ThinkingLevel } from '@google/genai';
import { config } from './config.ts';
import { loadKnowledge, type Tier } from './knowledge.ts';
import { pickTier } from './router.ts';
import { SYSTEM_PROMPT } from './prompt.ts';
import type { Turn } from './history.ts';

export type Answer = {
  text: string;
  usage: { input?: number; cached?: number; output?: number };
  error?: string;
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

function thinkingFor(model: string) {
  return model.startsWith('gemini-2')
    ? { thinkingBudget: config.gemini.thinkingBudget }
    : { thinkingLevel: config.gemini.thinkingLevel.toUpperCase() as ThinkingLevel };
}

// notices: avisos da administração no momento (status das áreas), enviados junto com a pergunta.
export async function answer(history: Turn[], question: string, now = new Date(), notices = '', tier?: Tier): Promise<Answer & { tier: Tier }> {
  const chosen = tier ?? pickTier(question, history);
  try {
    const res = await withFallback((model) =>
      getClient().models.generateContent({
        model,
        contents: [
          ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          { role: 'user', parts: [{ text: [describeNow(now), notices, question].filter(Boolean).join('\n') }] },
        ],
        config: { systemInstruction: systemFor(chosen), temperature: 0.2, thinkingConfig: thinkingFor(model) },
      }),
    );
    const usage = {
      input: res.usageMetadata?.promptTokenCount,
      cached: res.usageMetadata?.cachedContentTokenCount,
      output: res.usageMetadata?.candidatesTokenCount,
    };
    const text = res.text?.trim();
    if (text?.includes(NEEDS_DOCS) && chosen !== 'completa') {
      const full = await answer(history, question, now, notices, 'completa');
      return { ...full, usage: { input: (usage.input ?? 0) + (full.usage.input ?? 0), cached: full.usage.cached, output: full.usage.output } };
    }
    if (!text) return { text: ERROR_REPLY, usage, error: 'resposta vazia', tier: chosen };
    return { text, usage, tier: chosen };
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
