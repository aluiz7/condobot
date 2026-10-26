import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed, normalizePhone } from '../src/phone.ts';

test('acrescenta o nono dígito quando a Meta manda o celular sem ele', () => {
  assert.equal(normalizePhone('552196753226'), '5521996753226');
  assert.equal(normalizePhone('+55 (21) 99675-3226'), '5521996753226');
});

test('não mexe em fixo nem em número já completo', () => {
  assert.equal(normalizePhone('552125099002'), '552125099002');
  assert.equal(normalizePhone('5521996753226'), '5521996753226');
});

test('lista vazia libera todo mundo; com lista, só os números dela e o admin', () => {
  assert.equal(isAllowed('5521911112222', []), true);
  assert.equal(isAllowed('552191112222', ['5521991112222']), true);
  assert.equal(isAllowed('5521933334444', ['5521911112222']), false);
  assert.equal(isAllowed('5521955556666', ['5521911112222'], '5521955556666'), true);
});

test('knowledge carrega a base na ordem de prioridade', async () => {
  const { loadKnowledge } = await import('../src/knowledge.ts');
  const kb = loadKnowledge();
  const order = ['horarios-e-valores-2026.md', 'ramais.md', 'areas-comuns/churrasqueira.md', 'regimento-interno-2017.md', 'convencao-2010.md'];
  const positions = order.map((f) => kb.indexOf(f));
  assert.ok(positions.every((p) => p >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});
