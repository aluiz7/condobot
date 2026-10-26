import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTier } from '../src/router.ts';
import { loadKnowledge } from '../src/knowledge.ts';

test('horário, valor e ramal vão só com a base essencial', () => {
  assert.equal(pickTier('que horas abre a piscina?'), 'essencial');
  assert.equal(pickTier('quanto custa o salão infantil no sábado?'), 'essencial');
  assert.equal(pickTier('qual o ramal da portaria?'), 'essencial');
});

test('regra de convivência leva o regimento', () => {
  assert.equal(pickTier('pode fazer obra no sábado?'), 'regimento');
  assert.equal(pickTier('posso levar meu cachorro na piscina?'), 'regimento');
  assert.equal(pickTier('Mudança precisa avisar antes?'), 'regimento');
});

test('assembleia, voto e síndico levam a convenção', () => {
  assert.equal(pickTier('qual o quórum da assembleia?'), 'completa');
  assert.equal(pickTier('inquilino pode votar?'), 'completa');
  assert.equal(pickTier('Quem elege o síndico?'), 'completa');
});

test('pergunta de continuação herda o assunto da anterior', () => {
  const history = [
    { text: 'pode fazer obra no sábado?' },
    { text: 'Pode, das 8h às 12h.' },
  ];
  assert.equal(pickTier('e no domingo?', history), 'regimento');
});

test('cada nível é o começo do seguinte, para o cache reaproveitar o prefixo', () => {
  const essencial = loadKnowledge('essencial');
  const regimento = loadKnowledge('regimento');
  const completa = loadKnowledge('completa');
  assert.ok(regimento.startsWith(essencial));
  assert.ok(completa.startsWith(regimento));
  assert.ok(essencial.length < regimento.length && regimento.length < completa.length);
});
