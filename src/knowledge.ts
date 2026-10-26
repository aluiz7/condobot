import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// Ordem = prioridade. O prompt manda o modelo seguir esta ordem quando as fontes divergirem.
const ORDER = [
  'horarios-e-valores-2026.md',
  'ramais.md',
  'areas-comuns',
  'documentos/regimento-interno-2017.md',
  'documentos/convencao-2010.md',
];

function collect(root: string, entry: string): string[] {
  const path = join(root, entry);
  if (!entry.endsWith('.md')) {
    return readdirSync(path)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => join(path, f));
  }
  return [path];
}

// Quanto da base vai em cada chamada. Regimento e convenção são ~90% dos tokens; perguntas de horário,
// valor e ramal não precisam deles, e mandar menos texto deixa a resposta bem mais rápida.
export type Tier = 'essencial' | 'regimento' | 'completa';
const TIER_SIZE: Record<Tier, number> = { essencial: 3, regimento: 4, completa: ORDER.length };

export function loadKnowledge(tier: Tier = 'completa', root = join(import.meta.dirname, '..', 'base')): string {
  return ORDER.slice(0, TIER_SIZE[tier])
    .flatMap((entry) => collect(root, entry))
    .map((file) => {
      // Barra normal também no Windows, para o nome do arquivo ser o mesmo em qualquer máquina.
      const name = relative(root, file).replaceAll('\\', '/');
      return `<documento arquivo="${name}">\n${readFileSync(file, 'utf8').trim()}\n</documento>`;
    })
    .join('\n\n');
}
