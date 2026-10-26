import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickAnswer } from '../src/faq.ts';
import type { AreaStatus } from '../src/status.ts';

test('ramal sai direto da tabela', () => {
  assert.equal(quickAnswer('Ramal academia'), 'Academia: ramal *96*.\nLigação pelo interfone do apartamento.');
  const churras = quickAnswer('qual o ramal da churrasqueira?')!;
  assert.match(churras, /Churrasqueira 1: \*101\*/);
  assert.match(churras, /Churrasqueira 3: \*103\*/);
});

test('horário e valor saem direto da tabela', () => {
  assert.match(quickAnswer('que horas abre a piscina?')!, /^\*Piscina\*: Segunda a quinta, 8h às 19h/);
  assert.match(quickAnswer('horário da academia')!, /Sábado: 8h às 12h/);
  assert.match(quickAnswer('quanto custa o salão infantil?')!, /R\$ 324,20 de segunda a quinta e R\$ 486,30/);
  assert.match(quickAnswer('horário do salão gourmet')!, /^\*Salão gourmet\*: domingo a quinta, das 10h às 22h/);
});

test('pergunta com dia, regra, estado do momento ou ambígua vai para o modelo', () => {
  assert.equal(quickAnswer('a piscina abre domingo?'), undefined);
  assert.equal(quickAnswer('a piscina está aberta?'), undefined);
  assert.equal(quickAnswer('que horas abre a piscina hoje?'), undefined);
  assert.equal(quickAnswer('posso levar convidado na piscina?'), undefined);
  assert.equal(quickAnswer('quanto custa e qual o ramal do salão adulto?'), undefined);
  assert.equal(quickAnswer('horário da piscina e da academia'), undefined);
  assert.equal(quickAnswer('qual o horário da obra?'), undefined);
});

test('área com aviso da administração vai para o modelo', () => {
  const status = [{ area: 'Piscina', state: 'manutencao' } as AreaStatus];
  assert.equal(quickAnswer('horário da piscina', status), undefined);
  assert.ok(quickAnswer('horário da academia', status));
});
