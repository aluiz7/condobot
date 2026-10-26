import { GoogleGenAI, type ThinkingLevel } from '@google/genai';
import { config } from './config.ts';
import { loadKnowledge } from './knowledge.ts';
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
let systemInstruction: string | undefined;

function setup() {
  client ??= new GoogleGenAI({ apiKey: config.gemini.apiKey() });
  // A base inteira vai no system prompt. Como esse prefixo se repete em toda chamada,
  // o cache implícito do Gemini cobra bem menos pelos tokens repetidos.
  systemInstruction ??= `${SYSTEM_PROMPT}\n\n<base>\n${loadKnowledge()}\n</base>`;
  return { client, systemInstruction };
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

// 503 ("high demand") é comum e passageiro; vale insistir um pouco antes de devolver o erro ao morador.
const RETRY_DELAYS_MS = [2_000, 5_000];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= RETRY_DELAYS_MS.length || !/"code":\s*503|UNAVAILABLE/.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

export async function answer(history: Turn[], question: string, now = new Date()): Promise<Answer> {
  const { client, systemInstruction } = setup();
  try {
    const res = await withRetry(() => client.models.generateContent({
      model: config.gemini.model,
      contents: [
        ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        { role: 'user', parts: [{ text: `${describeNow(now)}\n${question}` }] },
      ],
      config: {
        systemInstruction,
        temperature: 0.2,
        thinkingConfig: config.gemini.model.startsWith('gemini-2')
          ? { thinkingBudget: config.gemini.thinkingBudget }
          : { thinkingLevel: config.gemini.thinkingLevel.toUpperCase() as ThinkingLevel },
      },
    }));
    const usage = {
      input: res.usageMetadata?.promptTokenCount,
      cached: res.usageMetadata?.cachedContentTokenCount,
      output: res.usageMetadata?.candidatesTokenCount,
    };
    const text = res.text?.trim();
    if (!text) return { text: ERROR_REPLY, usage, error: 'resposta vazia' };
    return { text, usage };
  } catch (err) {
    return { text: ERROR_REPLY, usage: {}, error: err instanceof Error ? err.message : String(err) };
  }
}
