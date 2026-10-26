import { appendFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { config } from './config.ts';

export type Interaction = {
  phone: string;
  question: string;
  reply: string;
  latencyMs: number;
  usage: Record<string, number | undefined>;
  error?: string;
  audio?: boolean;
  canned?: boolean;
  // Quanto da base foi junto: essencial, regimento ou completa.
  tier?: string;
};

// Respostas em que o bot admite não saber: é a lista que mostra o que falta na base.
const FALLBACK = /não tenho (essa|esta|isso|aqui)|não sei|não consta|ramal 90/i;

// O número nunca vai para o log em claro, só um identificador derivado dele.
export function pseudonymize(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 12);
}

export async function logInteraction(i: Interaction, now = new Date()) {
  const entry = {
    ts: now.toISOString(),
    user: pseudonymize(i.phone),
    question: i.question,
    reply: i.reply,
    fallback: !i.canned && FALLBACK.test(i.reply),
    latencyMs: i.latencyMs,
    usage: i.usage,
    error: i.error,
    audio: i.audio,
    canned: i.canned,
    tier: i.tier,
  };
  await mkdir(config.logDir, { recursive: true });
  const file = join(config.logDir, `interacoes-${now.toISOString().slice(0, 7)}.jsonl`);
  await appendFile(file, JSON.stringify(entry) + '\n');
}
