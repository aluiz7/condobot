import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AreaStatus } from './status.ts';

// Ramal, horário e valor saem direto das tabelas da base, sem chamar o modelo: a resposta leva milissegundos,
// não gasta cota e não cai com 503. Na dúvida (pergunta longa, com dia, regra, várias intenções), devolve
// undefined e a pergunta segue para o modelo.

const strip = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Row = string[];

// Tabelas Markdown do arquivo, indexadas pelo título da primeira coluna ("Área", "Espaço", "Local").
function parseTables(md: string): Map<string, Row[]> {
  const tables = new Map<string, Row[]>();
  let current: Row[] | undefined;
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) {
      current = undefined;
      continue;
    }
    const cells = line.slice(1, -1).split('|').map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (!current) {
      current = [];
      tables.set(strip(cells[0]), current);
    } else current.push(cells);
  }
  return tables;
}

// Cada assunto casa com a pergunta (q) e com o nome da linha na tabela (label, igual a q se omitido).
type Topic = { q: RegExp; label?: RegExp };
const TOPICS: Topic[] = [
  { q: /\badm\b|administra/ },
  { q: /adulto/ },
  { q: /gourmet/ },
  { q: /correio/ },
  { q: /portaria|ituacu|monteiro/ },
  { q: /academia/ },
  { q: /infantil/ },
  { q: /lan ?house/ },
  { q: /jogos/ },
  { q: /ginastica|luta/ },
  { q: /churrasq/ },
  { q: /quiosque/ },
  { q: /piscina/ },
  { q: /sauna/ },
  { q: /cinema/ },
  { q: /lava.?jato/ },
];
// "Salão" sozinho: os salões de festa e o gourmet. Só vale quando nenhum assunto mais específico casou.
const SALAO: Topic = { q: /\bsal(ao|oes)\b/, label: /salao (de festa )?(adulto|infantil)|gourmet/ };

const INTENTS = {
  ramal: /\bramal|\bramais|interfone/,
  horario: /horario|que horas|\babre\b|\bfecha\b|funciona|aberto|aberta/,
  valor: /quanto|valor|preco|custa|aluguel|alugar/,
};

// Dia, regra ou reserva pedem raciocínio (que dia é hoje, o que o regimento diz): ficam com o modelo.
const NEEDS_MODEL =
  /\besta\b|\bta\b|hoje|agora|amanha|ontem|domingo|segunda|terca|quarta|quinta|sexta|sabado|feriado|fim de semana|\d{1,2}\/\d{1,2}|\d{1,2} ?h|pode|posso|regra|reserv|cancel|convidad|morador|visit|multa|porque|por que/;

type Tables = { ramais: Row[]; valores: Row[]; horarios: Row[]; horarioAlugados: string; nota: string };
let cache: Tables | undefined;

function load(root = join(import.meta.dirname, '..', 'base')): Tables {
  if (cache) return cache;
  const ramaisMd = readFileSync(join(root, 'ramais.md'), 'utf8');
  const horariosMd = readFileSync(join(root, 'horarios-e-valores-2026.md'), 'utf8');
  const r = parseTables(ramaisMd);
  const h = parseTables(horariosMd);
  cache = {
    ramais: r.get('area') ?? [],
    valores: h.get('espaco') ?? [],
    horarios: h.get('local') ?? [],
    horarioAlugados: horariosMd.match(/\*\*Horário dos espaços alugados:\*\*\s*(.+)/)?.[1].trim() ?? '',
    nota: ramaisMd.match(/^Ligação pelo interfone.*$/m)?.[0] ?? '',
  };
  return cache;
}

function format(intent: keyof typeof INTENTS | 'uso', rows: Row[], t: Tables): string {
  if (intent === 'ramal') {
    const lines = rows.map(([area, ramal]) => (rows.length === 1 ? `${area}: ramal *${ramal}*.` : `• ${area}: *${ramal}*`));
    return [rows.length > 1 ? 'Ramais:' : '', ...lines, t.nota].filter(Boolean).join('\n');
  }
  if (intent === 'horario') return rows.map(([local, horario]) => `*${local}*: ${horario}`).join('\n');
  if (intent === 'uso') return rows.map(([espaco]) => `*${espaco}*: ${t.horarioAlugados}`).join('\n');
  const lines = rows.map(
    ([espaco, semana, fds, , , cap]) => `*${espaco}*: ${semana} de segunda a quinta e ${fds} no fim de semana e feriado (até ${cap}).`,
  );
  return [...lines, `Horário de uso: ${t.horarioAlugados.replace(/\.$/, '')}.`].join('\n');
}

export function quickAnswer(question: string, status: AreaStatus[] = []): string | undefined {
  const q = strip(question).replace(/[?!.,]/g, ' ').trim();
  if (q.split(/\s+/).length > 8 || q.includes('\n') || NEEDS_MODEL.test(q)) return undefined;

  const intents = (Object.keys(INTENTS) as (keyof typeof INTENTS)[]).filter((k) => INTENTS[k].test(q));
  let topics = TOPICS.filter((t) => t.q.test(q));
  if (topics.length === 0 && SALAO.q.test(q)) topics = [SALAO];
  if (intents.length > 1 || topics.length !== 1) return undefined;
  const topic = topics[0];
  const label = topic.label ?? topic.q;

  // Área com aviso de fechada ou em manutenção: quem responde é o modelo, que leva o aviso em conta.
  if (status.some((s) => label.test(strip(s.area)) || topic.q.test(strip(s.area)))) return undefined;

  const t = load();
  const pick = (table: Row[]) => table.filter((row) => label.test(strip(row[0])));
  // Salões e churrasqueiras não estão na tabela de horários: valem os horários dos espaços alugados.
  const horario = () => {
    const rows = pick(t.horarios);
    if (rows.length) return format('horario', rows, t);
    const rented = pick(t.valores);
    return rented.length ? format('uso', rented, t) : undefined;
  };
  const ramal = () => (pick(t.ramais).length ? format('ramal', pick(t.ramais), t) : undefined);
  const valor = () => (pick(t.valores).length ? format('valor', pick(t.valores), t) : undefined);

  // Só o nome da área ("Piscina"): manda o que a tabela tem sobre ela.
  if (intents.length === 0) {
    if (q.replace(/\b(o|a|os|as|da|do|de)\b/g, ' ').trim().split(/\s+/).length > 3) return undefined;
    const parts = [pick(t.valores).length ? valor() : horario(), ramal()].filter(Boolean);
    return parts.length ? parts.join('\n\n') : undefined;
  }
  return { ramal, horario, valor }[intents[0]]();
}
