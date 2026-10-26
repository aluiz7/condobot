import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
process.env.SUPER_ADMIN_PHONE = '5521900000000';
process.env.SINDICO_PHONES = '5521911110000';

const { handleRegistration, runResidentCommand } = await import('../src/registration.ts');
const { parseUnit, getResident } = await import('../src/residents.ts');

const ADMIN = '5521900000000';
const SINDICA = '5521911110000';
const ANA = '5521922220001';
const BRUNO = '5521922220002';
const CARLA = '5521922220003';
const INTRUSO = '5521922220009';

// Manda uma sequência de mensagens e devolve as respostas da última.
function say(phone: string, ...msgs: string[]) {
  let out;
  for (const m of msgs) out = handleRegistration(phone, m);
  return out ?? [];
}
const to = (out: { to: string; text: string }[], phone: string) => out.filter((o) => o.to === phone).map((o) => o.text).join('\n');
const codeIn = (text: string) => text.match(/#aprovar (\w{4})|sim (\w{4})/)!.slice(1).find(Boolean)!;

test('unidade em vários formatos', () => {
  const u = { fase: '1', bloco: '04', apto: '503' };
  assert.deepEqual(parseUnit('fase 1, bloco 4, apto 503'), u);
  assert.deepEqual(parseUnit('F1 BL04 AP503'), u);
  assert.deepEqual(parseUnit('bloco 04 apartamento 503 fase 1'), u);
  assert.deepEqual(parseUnit('1 4 503'), u);
  assert.equal(parseUnit('moro no 503'), undefined);
});

test('mensagem comum não entra no cadastro', () => {
  assert.equal(handleRegistration(ANA, 'quanto custa o salão?'), undefined);
});

test('primeiro morador do apto: a administração aprova', () => {
  const out = say(ANA, 'cadastro', 'ana souza', 'fase 1, bloco 4, apto 503', 'sim');
  assert.match(to(out, ANA), /administração confere/);
  assert.match(to(out, ADMIN), /Novo cadastro: \*Ana Souza\*, fase 1, bloco 04, apto 503/);
  assert.match(to(out, SINDICA), /#aprovar/);
  assert.match(to(say(ANA, 'meu cadastro'), ANA), /aguardando aprovação/);

  const code = codeIn(to(out, ADMIN));
  const approved = runResidentCommand(`#aprovar ${code.toLowerCase()}`, SINDICA)!;
  assert.match(to(approved, SINDICA), /Aprovado: Ana Souza/);
  assert.match(to(approved, ANA), /foi liberado/);
  assert.equal(getResident(ANA)?.role, 'responsavel');
  assert.match(to(runResidentCommand(`#aprovar ${code}`, SINDICA)!, SINDICA), /Não achei/, 'código não vale duas vezes');
});

test('família: só o responsável do apto aprova', () => {
  const out = say(BRUNO, 'quero me cadastrar', 'Bruno Souza', '1 4 503', 'sim', '1');
  assert.match(to(out, BRUNO), /responsável do apto/);
  assert.match(to(out, ANA), /\*Bruno Souza\* pediu para entrar/);
  const code = codeIn(to(out, ANA));

  assert.equal(handleRegistration(INTRUSO, `sim ${code}`), undefined, 'outro número não aprova');
  const approved = handleRegistration(ANA, `sim ${code}`)!;
  assert.match(to(approved, BRUNO), /foi liberado/);
  assert.equal(getResident(BRUNO)?.role, 'dependente');
  assert.match(to(say(BRUNO, 'cadastro'), BRUNO), /já está cadastrado/);
});

test('mudança: a administração aprova e a família anterior é avisada', () => {
  const out = say(CARLA, 'cadastro', 'Carla Lima', 'fase 1 bloco 4 apto 503', 'sim', '2');
  assert.match(to(out, ADMIN), /Mudança/);
  assert.equal(to(out, ANA), '', 'responsável atual não decide mudança');

  const approved = runResidentCommand(`#aprovar ${codeIn(to(out, ADMIN))}`, ADMIN)!;
  assert.match(to(approved, ADMIN), /Saíram do cadastro do apto: Ana Souza, Bruno Souza/);
  assert.match(to(approved, ANA), /encerrado por mudança/);
  assert.match(to(approved, BRUNO), /encerrado por mudança/);
  assert.equal(getResident(ANA)?.status, 'saiu');
  assert.equal(getResident(CARLA)?.role, 'responsavel');
});

test('correção, cancelamento, recusa e lista de pendentes', () => {
  assert.match(to(say(INTRUSO, 'cadastro', 'Zé'), INTRUSO), /nome e sobrenome/);
  assert.match(to(say(INTRUSO, 'José Pereira', 'moro aqui'), INTRUSO), /Não entendi/);
  assert.match(to(say(INTRUSO, 'fase 2 bloco 1 apto 101', 'não'), INTRUSO), /vamos de novo/);
  assert.match(to(say(INTRUSO, 'cancelar'), INTRUSO), /cancelado/);
  assert.equal(handleRegistration(INTRUSO, 'oi'), undefined, 'depois de cancelar volta ao normal');

  const out = say(INTRUSO, 'cadastro', 'José Pereira', 'fase 2 bloco 1 apto 101', 'sim');
  assert.match(to(runResidentCommand('#pendentes', ADMIN)!, ADMIN), /José Pereira, fase 2, bloco 01, apto 101 \(aguarda você\)/);
  const refused = runResidentCommand(`#recusar ${codeIn(to(out, ADMIN))}`, ADMIN)!;
  assert.match(to(refused, INTRUSO), /não confirmou/);
  assert.match(to(runResidentCommand('#pendentes', ADMIN)!, ADMIN), /Nenhum cadastro/);
});
