import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

// Um único SQLite para o que precisa sobreviver a reinícios: status das áreas e cadastro de moradores.
let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;
  const memory = config.dataDir === ':memory:';
  if (!memory) mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(memory ? ':memory:' : join(config.dataDir, 'condobot.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS area_status (
      key TEXT PRIMARY KEY,
      area TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('fechada', 'manutencao')),
      note TEXT,
      until TEXT,
      until_label TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      reminded INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS residents (
      phone TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fase TEXT NOT NULL,
      bloco TEXT NOT NULL,
      apto TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('responsavel', 'dependente')),
      status TEXT NOT NULL CHECK (status IN ('ativo', 'pendente', 'recusado', 'saiu')),
      kind TEXT NOT NULL DEFAULT 'novo' CHECK (kind IN ('novo', 'familia', 'mudanca')),
      code TEXT,
      avisos INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      decided_at TEXT,
      decided_by TEXT
    );
    CREATE INDEX IF NOT EXISTS residents_unit ON residents (fase, bloco, apto, status);
    CREATE UNIQUE INDEX IF NOT EXISTS residents_code ON residents (code) WHERE code IS NOT NULL;
  `);
  return db;
}
