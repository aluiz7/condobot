import { randomInt } from 'node:crypto';
import { getDb } from './db.ts';
import { normalizePhone } from './phone.ts';

export type Unit = { fase: string; bloco: string; apto: string };
export type Kind = 'novo' | 'familia' | 'mudanca';
export type Resident = Unit & {
  phone: string;
  name: string;
  role: 'responsavel' | 'dependente';
  status: 'ativo' | 'pendente' | 'recusado' | 'saiu';
  kind: Kind;
  code: string | null;
};

const COLUMNS = 'phone, name, fase, bloco, apto, role, status, kind, code';

// "fase 1, bloco 4, apto 503", "F1 BL04 AP503" ou só "1 4 503" (nessa ordem).
export function parseUnit(text: string): Unit | undefined {
  const t = text.toLowerCase();
  const fase = t.match(/f(?:ase)?\s*0*(\d{1,2})\b/)?.[1];
  const bloco = t.match(/b(?:l|loco)?\s*0*(\d{1,2})\b/)?.[1];
  const apto = t.match(/a(?:p|pto|partamento)?\.?\s*(\d{2,4})\b/)?.[1];
  if (fase && bloco && apto) return { fase, bloco: bloco.padStart(2, '0'), apto };
  const nums = t.match(/\d+/g);
  if (nums?.length === 3 && !/[a-z]{3,}/.test(t.replace(/fase|bloco|apto|ap|bl/g, ''))) {
    return { fase: String(Number(nums[0])), bloco: String(Number(nums[1])).padStart(2, '0'), apto: String(Number(nums[2])) };
  }
  return undefined;
}

export function unitLabel(u: Unit): string {
  return `fase ${u.fase}, bloco ${u.bloco}, apto ${u.apto}`;
}

export function getResident(phone: string): Resident | undefined {
  return getDb().prepare(`SELECT ${COLUMNS} FROM residents WHERE phone = ?`).get(normalizePhone(phone)) as Resident | undefined;
}

export function getByCode(code: string): Resident | undefined {
  return getDb().prepare(`SELECT ${COLUMNS} FROM residents WHERE code = ?`).get(code.toUpperCase()) as Resident | undefined;
}

export function unitResponsavel(u: Unit): Resident | undefined {
  return getDb()
    .prepare(`SELECT ${COLUMNS} FROM residents WHERE fase = ? AND bloco = ? AND apto = ? AND status = 'ativo' AND role = 'responsavel'`)
    .get(u.fase, u.bloco, u.apto) as Resident | undefined;
}

export function listPending(): Resident[] {
  return getDb().prepare(`SELECT ${COLUMNS} FROM residents WHERE status = 'pendente' ORDER BY created_at`).all() as Resident[];
}

// Código curto para aprovar pelo WhatsApp, sem letras que se confundem (0/O, 1/I).
function newCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
    if (!getByCode(code)) return code;
  }
}

export function createRequest(r: { phone: string; name: string; unit: Unit; kind: Kind }, now = new Date()): Resident {
  const row: Resident = {
    phone: normalizePhone(r.phone),
    name: r.name,
    ...r.unit,
    role: r.kind === 'familia' ? 'dependente' : 'responsavel',
    status: 'pendente',
    kind: r.kind,
    code: newCode(),
  };
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO residents (phone, name, fase, bloco, apto, role, status, kind, code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.phone, row.name, row.fase, row.bloco, row.apto, row.role, row.status, row.kind, row.code, now.toISOString());
  return row;
}

// Aprova ou recusa um pedido. Na mudança, quem morava no apto sai do cadastro.
// Devolve os moradores removidos pela mudança, para avisá-los.
export function decide(code: string, approve: boolean, by: string, now = new Date()): { resident?: Resident; removed: Resident[] } {
  const r = getByCode(code);
  if (!r || r.status !== 'pendente') return { removed: [] };
  const db = getDb();
  let removed: Resident[] = [];
  if (approve && r.kind === 'mudanca') {
    removed = db
      .prepare(`SELECT ${COLUMNS} FROM residents WHERE fase = ? AND bloco = ? AND apto = ? AND status = 'ativo'`)
      .all(r.fase, r.bloco, r.apto) as Resident[];
    db.prepare(`UPDATE residents SET status = 'saiu', decided_at = ?, decided_by = ? WHERE fase = ? AND bloco = ? AND apto = ? AND status = 'ativo'`).run(
      now.toISOString(),
      by,
      r.fase,
      r.bloco,
      r.apto,
    );
  }
  const status = approve ? 'ativo' : 'recusado';
  db.prepare('UPDATE residents SET status = ?, code = NULL, decided_at = ?, decided_by = ? WHERE phone = ?').run(status, now.toISOString(), by, r.phone);
  return { resident: { ...r, status, code: null }, removed };
}
