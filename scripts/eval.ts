// Roda as perguntas de tests/perguntas-reais.md no modelo (sem WhatsApp) e salva as respostas lado a lado
// com o comportamento esperado, para revisão manual antes da demo.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { answer } from '../src/llm.ts';

type Case = { n: string; question: string; kind: string; expected: string; source: string };

const file = await readFile(new URL('../tests/perguntas-reais.md', import.meta.url), 'utf8');
const cases: Case[] = file
  .split('\n')
  .filter((l) => /^\| \d+ \|/.test(l))
  .map((l) => {
    const [n, question, kind, expected, source] = l.split('|').slice(1, -1).map((c) => c.trim());
    return { n, question, kind, expected, source };
  });

// Data fixa para os resultados serem comparáveis entre rodadas: uma terça-feira às 10h.
const now = new Date(process.env.EVAL_NOW ?? '2026-10-27T10:00:00-03:00');
const only = process.argv.slice(2);
const selected = only.length ? cases.filter((c) => only.includes(c.n)) : cases;

// O relatório é gravado a cada resposta, para não perder o que já rodou se a cota acabar no meio.
await mkdir('eval-results', { recursive: true });
const out = `eval-results/${new Date().toISOString().slice(0, 16).replace(':', '')}.md`;
await writeFile(out, `# Avaliação (${selected.length} perguntas, data simulada ${now.toISOString()})\n\n`);
let totalInput = 0;
let totalCached = 0;
// No plano gratuito do Gemini o limite é de 250 mil tokens de entrada por minuto, e cada chamada leva a base
// inteira (~55 mil tokens). EVAL_DELAY_MS espaça as chamadas; no plano pago pode ser 0.
const delayMs = Number(process.env.EVAL_DELAY_MS ?? '16000');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const [i, c] of selected.entries()) {
  if (i > 0) await sleep(delayMs);
  const started = Date.now();
  let r = await answer([], c.question, now);
  // Cota diária esgotada: esperar não adianta, então para aqui.
  if (r.error?.includes('PerDay')) {
    console.log(`#${c.n} cota diária do Gemini esgotada; parando. Resultados parciais em ${out}`);
    break;
  }
  if (r.error?.includes('429')) {
    await sleep(60_000);
    r = await answer([], c.question, now);
  }
  totalInput += r.usage.input ?? 0;
  totalCached += r.usage.cached ?? 0;
  console.log(`#${c.n} (${Date.now() - started} ms)${r.error ? ' ERRO ' + r.error : ''}`);
  await appendFile(
    out,
    `## ${c.n}. ${c.question}\n\n**Tipo:** ${c.kind} · **Fonte:** ${c.source}\n\n**Esperado:** ${c.expected}\n\n**Resposta:**\n\n${r.text
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n')}\n\n**Revisão:** [ ] ok [ ] falha\n\n`,
  );
}

await appendFile(out, `---\n\nTokens de entrada: ${totalInput} (em cache: ${totalCached})\n`);
console.log(`Resultados em ${out}`);
