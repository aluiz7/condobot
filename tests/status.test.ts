import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';

const { parseDeadline } = await import('../src/deadline.ts');
const { runAdminCommand } = await import('../src/commands.ts');
const { formatNotices, listStatus, takeDueReminders } = await import('../src/status.ts');

// Terça, 27/10/2026, 10h em Brasília.
const now = new Date('2026-10-27T10:00:00-03:00');
const iso = (d?: Date) => d?.toISOString();

test('prazos em português', () => {
  assert.equal(iso(parseDeadline('18h', now).date), '2026-10-27T21:00:00.000Z');
  assert.equal(iso(parseDeadline('9h', now).date), '2026-10-28T12:00:00.000Z', 'hora que já passou vira amanhã');
  assert.equal(iso(parseDeadline('amanhã', now).date), '2026-10-28T21:00:00.000Z', 'só o dia vence às 18h');
  assert.equal(iso(parseDeadline('sexta 14h30', now).date), '2026-10-30T17:30:00.000Z');
  assert.equal(iso(parseDeadline('terça', now).date), '2026-11-03T21:00:00.000Z', 'o mesmo dia da semana é o da próxima');
  assert.equal(iso(parseDeadline('30/10 às 8:15', now).date), '2026-10-30T11:15:00.000Z');
  assert.equal(iso(parseDeadline('3 dias', now).date), '2026-10-30T13:00:00.000Z');
  assert.equal(iso(parseDeadline('2 horas', now).date), '2026-10-27T15:00:00.000Z');
  assert.equal(parseDeadline('quando a peça chegar', now).date, undefined);
  assert.equal(parseDeadline('quando a peça chegar', now).label, 'quando a peça chegar');
});

test('manutenção, status e reabertura pela síndica', () => {
  const reply = runAdminCommand('#manutenção Piscina até sexta 18:30: troca do filtro', '5521999990001', now)!;
  assert.match(reply, /Piscina: em manutenção/);
  assert.match(reply, /troca do filtro/);
  assert.match(reply, /Te lembro/);

  runAdminCommand('#fechar salão adulto: evento da administração', '5521999990001', now);
  assert.equal(listStatus().length, 2);
  assert.match(formatNotices(listStatus()), /Salão adulto: fechada.*evento da administração/);

  assert.match(runAdminCommand('#abrir SALAO ADULTO', '5521999990001', now)!, /voltou ao funcionamento normal/);
  assert.match(runAdminCommand('#abrir quadra', '5521999990001', now)!, /Não havia aviso/);
  assert.equal(listStatus().length, 1);
});

test('prazo que não entendeu fica registrado como texto, sem lembrete', () => {
  const reply = runAdminCommand('#manutencao elevador bloco 6 até a peça chegar', '5521999990001', now)!;
  assert.match(reply, /Não entendi o prazo "a peça chegar"/);
  assert.match(formatNotices(listStatus()), /Elevador bloco 6: em manutenção.*previsão: a peça chegar/);
});

test('lembrete sai uma vez quando o prazo vence', () => {
  const later = new Date('2026-10-30T19:00:00-03:00');
  const due = takeDueReminders(later);
  assert.deepEqual(due.map((d) => d.area), ['Piscina']);
  assert.equal(due[0].updatedBy, '5521999990001');
  assert.equal(takeDueReminders(later).length, 0);
});

test('sem avisos, o modelo recebe "nenhum"; texto comum não é comando', () => {
  assert.equal(formatNotices([]), '[Avisos da administração agora: nenhum.]');
  assert.equal(runAdminCommand('quanto custa o salão?', 'x', now), undefined);
  assert.equal(runAdminCommand('#qualquercoisa', 'x', now), undefined);
});
