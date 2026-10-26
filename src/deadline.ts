// Interpreta o prazo que a síndica escreve no comando ("sexta 18h", "amanhã", "3 dias", "30/10 14h").
// Brasília não tem horário de verão desde 2019, então o fuso é fixo em UTC-3.
const OFFSET_H = 3;
const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
// Prazo só com dia ("até sexta") vence no fim do expediente da administração.
const DEFAULT_HOUR = 18;

export type Deadline = { date?: Date; label: string };

function strip(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Data e hora em Brasília -> Date.
function brt(y: number, m: number, d: number, h: number, min = 0) {
  return new Date(Date.UTC(y, m, d, h + OFFSET_H, min));
}

// Partes da data atual em Brasília.
function parts(now: Date) {
  const local = new Date(now.getTime() - OFFSET_H * 3600_000);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), wd: local.getUTCDay() };
}

export function parseDeadline(input: string, now = new Date()): Deadline {
  const label = input.trim();
  const t = strip(label).replace(/^(ate|as|às)\s+/, '');

  const rel = t.match(/^(\d+)\s*(min|minutos?|horas?|dias?|semanas?)$/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const ms = unit.startsWith('min') ? 60_000 : unit.startsWith('hora') ? 3600_000 : unit.startsWith('dia') ? 86400_000 : 7 * 86400_000;
    return { date: new Date(now.getTime() + n * ms), label };
  }

  // Dia (opcional) + hora (opcional): "sexta 18h", "amanha as 14:30", "30/10", "18h".
  const m = t.match(
    /^(?:(hoje|amanha|depois de amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?|(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)?\s*(?:as\s+)?(?:(\d{1,2})(?:h|:)(\d{2})?h?)?$/,
  );
  if (!m || (!m[1] && !m[2] && !m[5])) return { label };

  const today = parts(now);
  let { y, m: mo, d } = today;
  if (m[1] === 'amanha') d += 1;
  else if (m[1] === 'depois de amanha') d += 2;
  else if (m[1] && m[1] !== 'hoje') {
    const target = WEEKDAYS.indexOf(m[1]);
    d += (target - today.wd + 7) % 7 || 7;
  } else if (m[2]) {
    d = Number(m[2]);
    mo = Number(m[3]) - 1;
    if (m[4]) y = Number(m[4].length === 2 ? '20' + m[4] : m[4]);
  }
  const hour = m[5] ? Number(m[5]) : DEFAULT_HOUR;
  const min = m[6] ? Number(m[6]) : 0;
  if (hour > 23 || min > 59 || mo < 0 || mo > 11 || d < 1) return { label };

  let date = brt(y, mo, d, hour, min);
  // Só a hora e ela já passou hoje: é amanhã. Data sem ano que já passou: é do ano que vem.
  if (!m[1] && !m[2] && date <= now) date = brt(y, mo, d + 1, hour, min);
  if (m[2] && !m[4] && date <= now) date = brt(y + 1, mo, d, hour, min);
  return { date, label };
}

export function formatBrt(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
