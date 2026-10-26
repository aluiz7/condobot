import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';
import { formatBrt } from './deadline.ts';

// Status das áreas comuns informado pela síndica. Só guarda exceções: área sem registro funciona pela tabela.
export type AreaState = 'fechada' | 'manutencao';
export type AreaStatus = {
  key: string;
  area: string;
  state: AreaState;
  note: string | null;
  until: string | null;
  untilLabel: string | null;
  updatedAt: string;
  updatedBy: string;
};

let db: DatabaseSync | undefined;

function getDb() {
  if (db) return db;
  const path = config.dataDir === ':memory:' ? ':memory:' : join(config.dataDir, 'condobot.db');
  if (path !== ':memory:') mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS area_status (
    key TEXT PRIMARY KEY,
    area TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('fechada', 'manutencao')),
    note TEXT,
    until TEXT,
    until_label TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    reminded INTEGER NOT NULL DEFAULT 0
  )`);
  return db;
}

// "Salão  Infantil" e "salao infantil" são a mesma área.
export function areaKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function capitalize(name: string) {
  const clean = name.replace(/\s+/g, ' ').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

const COLUMNS = `key, area, state, note, until, until_label AS untilLabel, updated_at AS updatedAt, updated_by AS updatedBy`;

export function setStatus(
  s: { area: string; state: AreaState; note?: string; until?: Date; untilLabel?: string; by: string },
  now = new Date(),
): AreaStatus {
  const row = {
    key: areaKey(s.area),
    area: capitalize(s.area),
    state: s.state,
    note: s.note || null,
    until: s.until?.toISOString() ?? null,
    untilLabel: s.untilLabel || null,
    updatedAt: now.toISOString(),
    updatedBy: s.by,
  };
  getDb()
    .prepare(
      `INSERT INTO area_status (key, area, state, note, until, until_label, updated_at, updated_by, reminded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT (key) DO UPDATE SET area = excluded.area, state = excluded.state, note = excluded.note,
         until = excluded.until, until_label = excluded.until_label, updated_at = excluded.updated_at,
         updated_by = excluded.updated_by, reminded = 0`,
    )
    .run(row.key, row.area, row.state, row.note, row.until, row.untilLabel, row.updatedAt, row.updatedBy);
  return row;
}

export function clearStatus(area: string): AreaStatus | undefined {
  const key = areaKey(area);
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM area_status WHERE key = ?`).get(key) as AreaStatus | undefined;
  if (row) getDb().prepare('DELETE FROM area_status WHERE key = ?').run(key);
  return row;
}

export function listStatus(): AreaStatus[] {
  return getDb().prepare(`SELECT ${COLUMNS} FROM area_status ORDER BY area`).all() as AreaStatus[];
}

// Prazos vencidos que ainda não geraram lembrete para quem registrou.
export function takeDueReminders(now = new Date()): AreaStatus[] {
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM area_status WHERE reminded = 0 AND until IS NOT NULL AND until <= ?`)
    .all(now.toISOString()) as AreaStatus[];
  const mark = getDb().prepare('UPDATE area_status SET reminded = 1 WHERE key = ?');
  for (const r of rows) mark.run(r.key);
  return rows;
}

export function describeStatus(s: AreaStatus): string {
  const state = s.state === 'manutencao' ? 'em manutenção' : 'fechada';
  const until = s.untilLabel ? `, previsão: ${s.until ? formatBrt(new Date(s.until)) : s.untilLabel}` : '';
  const note = s.note ? `. Motivo: ${s.note}` : '';
  return `${s.area}: ${state} (aviso de ${formatBrt(new Date(s.updatedAt))}${until})${note}`;
}

// Linha que entra junto com a pergunta do morador. Fica fora do system prompt para não quebrar o cache da base.
export function formatNotices(rows: AreaStatus[]): string {
  if (rows.length === 0) return '[Avisos da administração agora: nenhum.]';
  return `[Avisos da administração agora:\n${rows.map((r) => `- ${describeStatus(r)}`).join('\n')}]`;
}
