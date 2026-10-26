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

export function loadKnowledge(root = join(import.meta.dirname, '..', 'base')): string {
  return ORDER.flatMap((entry) => collect(root, entry))
    .map((file) => {
      const name = relative(root, file);
      return `<documento arquivo="${name}">\n${readFileSync(file, 'utf8').trim()}\n</documento>`;
    })
    .join('\n\n');
}
