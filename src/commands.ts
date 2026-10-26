import { formatBrt, parseDeadline } from './deadline.ts';
import { clearStatus, describeStatus, listStatus, setStatus } from './status.ts';

export const ADMIN_HELP = `Comandos da administração:

*#manutencao <área> até <prazo>: <motivo>*
Ex.: #manutencao piscina até sexta 18h: troca do filtro

*#fechar <área>: <motivo>*
Ex.: #fechar salão adulto: evento da administração

*#abrir <área>* volta ao normal
*#status* lista os avisos ativos

O prazo e o motivo são opcionais. Prazos aceitos: "18h", "amanhã", "sexta 14h", "30/10", "3 dias". Quando o prazo vence, eu te lembro.`;

// Comandos da síndica. Devolve a resposta, ou undefined se a mensagem não é um comando conhecido.
export function runAdminCommand(text: string, by: string, now = new Date()): string | undefined {
  const m = text.trim().match(/^#(\S+)\s*([\s\S]*)$/);
  if (!m) return undefined;
  const cmd = m[1].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const rest = m[2].trim();

  if (cmd === 'ajuda' || cmd === 'help' || cmd === 'comandos') return ADMIN_HELP;

  if (cmd === 'status') {
    const rows = listStatus();
    if (rows.length === 0) return 'Nenhum aviso ativo. Todas as áreas seguem a tabela de horários.';
    return `Avisos ativos:\n${rows.map((r) => `• ${describeStatus(r)}`).join('\n')}`;
  }

  if (cmd === 'abrir' || cmd === 'reabrir') {
    if (!rest) return 'Qual área? Ex.: #abrir piscina';
    const removed = clearStatus(rest);
    if (!removed) return `Não havia aviso para "${rest}". Use #status para ver os ativos.`;
    return `Pronto: *${removed.area}* voltou ao funcionamento normal.`;
  }

  if (cmd === 'fechar' || cmd.startsWith('manut')) {
    // "<área> até <prazo>: <motivo>"; prazo e motivo são opcionais.
    // O primeiro ":" que não é de hora ("18:30") separa o motivo.
    const cut = rest.search(/:(?!\d{2})/);
    const head = cut === -1 ? rest : rest.slice(0, cut);
    const note = cut === -1 ? '' : rest.slice(cut + 1).trim();
    const [area, deadlineText] = head.split(/\s+at[eé]\s+/i).map((s) => s.trim());
    if (!area) return `Qual área? Ex.: #${cmd === 'fechar' ? 'fechar salão adulto: evento' : 'manutencao piscina até sexta 18h'}`;

    const deadline = deadlineText ? parseDeadline(deadlineText, now) : undefined;
    const row = setStatus(
      { area, state: cmd === 'fechar' ? 'fechada' : 'manutencao', note, until: deadline?.date, untilLabel: deadline?.label, by },
      now,
    );

    const lines = [`Registrado: ${describeStatus(row)}.`, 'Já estou respondendo isso aos moradores.'];
    if (deadline && !deadline.date) {
      lines.push(`Não entendi o prazo "${deadline.label}", então vou mostrar do jeito que você escreveu, sem lembrete.`);
    } else if (deadline?.date) {
      lines.push(`Te lembro em ${formatBrt(deadline.date)} se ainda estiver ativo.`);
    }
    lines.push(`Para reabrir: #abrir ${row.area.toLowerCase()}`);
    return lines.join('\n');
  }

  return undefined;
}

export function reminderText(area: string, untilLabel: string | null): string {
  return `A previsão da *${area}*${untilLabel ? ` (${untilLabel})` : ''} venceu e o aviso continua ativo.\n\nSe já reabriu: #abrir ${area.toLowerCase()}\nSe vai demorar: #manutencao ${area.toLowerCase()} até <novo prazo>`;
}
