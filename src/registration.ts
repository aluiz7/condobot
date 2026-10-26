import { config } from './config.ts';
import { createRequest, decide, getByCode, getResident, listPending, parseUnit, unitLabel, unitResponsavel, type Kind, type Resident, type Unit } from './residents.ts';
import { normalizePhone } from './phone.ts';

// Cadastro do morador na unidade, em etapas fixas (sem modelo): nome, unidade, confirmação e, se o apto
// já tem responsável, se é da mesma família ou mudança. Família: o responsável aprova. Primeiro do apto
// ou mudança: a administração aprova.
export type Outgoing = { to: string; text: string };

type Session = { step: 'nome' | 'unidade' | 'confirmar' | 'vinculo'; name?: string; unit?: Unit; updatedAt: number };
const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 60 * 60 * 1000;

const START = /^#?(cadastro|cadastrar|me cadastrar|quero (me )?cadastrar|fazer cadastro)[\s!.?]*$/i;
const STATUS = /^#?(meu cadastro|status do (meu )?cadastro)[\s!.?]*$/i;
const CANCEL = /^(cancelar|cancela|sair|parar)[\s!.]*$/i;
const YES = /^(sim|s|isso|confirmo|ok|certo)[\s!.]*$/i;
const NO = /^(n[aã]o|n|errado)[\s!.]*$/i;
const DECISION = /^(sim|s|n[aã]o|n)\s+([a-z0-9]{4})[\s!.]*$/i;

function admins(): string[] {
  return [config.superAdminPhone, ...config.sindicoPhones].filter(Boolean);
}

function adminNotice(r: Resident): Outgoing[] {
  const what = r.kind === 'mudanca' ? 'Mudança (novo morador no lugar da família atual)' : 'Novo cadastro';
  const text = `${what}: *${r.name}*, ${unitLabel(r)}, telefone ${r.phone}.\n\n#aprovar ${r.code} ou #recusar ${r.code}`;
  return admins().map((to) => ({ to, text }));
}

function approvedText(r: Resident): string {
  return `Pronto, ${r.name.split(' ')[0]}! Seu cadastro no ${unitLabel(r)} foi liberado.`;
}

function submit(phone: string, s: Session, kind: Kind, now: Date): Outgoing[] {
  sessions.delete(phone);
  const r = createRequest({ phone, name: s.name!, unit: s.unit!, kind }, now);
  if (kind === 'familia') {
    const owner = unitResponsavel(s.unit!)!;
    return [
      { to: phone, text: `Pedi a liberação para o responsável do apto. Assim que ele aprovar, te aviso aqui.` },
      {
        to: owner.phone,
        text: `*${r.name}* pediu para entrar no cadastro do seu apartamento (${unitLabel(r)}).\n\nSe é da sua família, responda *sim ${r.code}*. Se não conhece, responda *não ${r.code}*.`,
      },
    ];
  }
  return [{ to: phone, text: `Recebido! A administração confere e te aviso aqui quando for liberado.` }, ...adminNotice(r)];
}

export function handleRegistration(phone: string, text: string, now = new Date()): Outgoing[] | undefined {
  const t = text.trim();

  // Resposta do responsável a um pedido da família: "sim K7QM" / "não K7QM".
  const decision = t.match(DECISION);
  if (decision) {
    const pending = getByCode(decision[2]);
    const owner = pending && unitResponsavel(pending);
    if (pending?.status === 'pendente' && pending.kind === 'familia' && owner && normalizePhone(owner.phone) === normalizePhone(phone)) {
      const approve = /^s/i.test(decision[1]);
      decide(pending.code!, approve, owner.phone, now);
      return approve
        ? [{ to: phone, text: `Liberado: ${pending.name} agora está no cadastro do apto.` }, { to: pending.phone, text: approvedText(pending) }]
        : [
            { to: phone, text: `Ok, o pedido de ${pending.name} foi recusado.` },
            { to: pending.phone, text: `O responsável do apto não confirmou seu cadastro. Se for engano, fale com a administração (ramal 90).` },
          ];
    }
  }

  let s = sessions.get(phone);
  if (s && now.getTime() - s.updatedAt > SESSION_TTL_MS) {
    sessions.delete(phone);
    s = undefined;
  }

  if (!s) {
    if (STATUS.test(t)) {
      const r = getResident(phone);
      if (!r || r.status === 'recusado' || r.status === 'saiu') return [{ to: phone, text: 'Você ainda não tem cadastro. Para fazer, digite *cadastro*.' }];
      if (r.status === 'pendente') return [{ to: phone, text: `Seu cadastro no ${unitLabel(r)} está aguardando aprovação.` }];
      return [{ to: phone, text: `Você está cadastrado no ${unitLabel(r)}, como ${r.role === 'responsavel' ? 'responsável' : 'morador'}.` }];
    }
    if (!START.test(t)) return undefined;
    const r = getResident(phone);
    if (r?.status === 'ativo') return [{ to: phone, text: `Você já está cadastrado no ${unitLabel(r)}. Para mudar, fale com a administração (ramal 90).` }];
    if (r?.status === 'pendente') return [{ to: phone, text: `Seu cadastro no ${unitLabel(r)} já está aguardando aprovação.` }];
    sessions.set(phone, { step: 'nome', updatedAt: now.getTime() });
    return [{ to: phone, text: 'Vamos fazer seu cadastro. Qual é o seu nome completo?\n\n(Para desistir a qualquer momento, digite *cancelar*.)' }];
  }

  s.updatedAt = now.getTime();
  if (CANCEL.test(t)) {
    sessions.delete(phone);
    return [{ to: phone, text: 'Cadastro cancelado. Se quiser retomar, é só digitar *cadastro*.' }];
  }

  switch (s.step) {
    case 'nome': {
      const name = t.replace(/\s+/g, ' ');
      if (!/^[\p{L}' .-]{3,60}$/u.test(name) || !name.includes(' ')) return [{ to: phone, text: 'Me manda seu nome e sobrenome, por favor.' }];
      s.name = name.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
      s.step = 'unidade';
      return [{ to: phone, text: 'Qual a sua fase, bloco e apartamento? Ex.: fase 1, bloco 4, apto 503' }];
    }
    case 'unidade': {
      const unit = parseUnit(t);
      if (!unit) return [{ to: phone, text: 'Não entendi. Escreve assim: fase 1, bloco 4, apto 503' }];
      s.unit = unit;
      s.step = 'confirmar';
      return [{ to: phone, text: `Confere?\n\n*${s.name}*\n${unitLabel(unit)}\n\nResponda *sim* ou *não*.` }];
    }
    case 'confirmar': {
      if (NO.test(t)) {
        s.step = 'nome';
        return [{ to: phone, text: 'Sem problema, vamos de novo. Qual é o seu nome completo?' }];
      }
      if (!YES.test(t)) return [{ to: phone, text: 'Responda *sim* para confirmar ou *não* para corrigir.' }];
      const owner = unitResponsavel(s.unit!);
      if (!owner) return submit(phone, s, 'novo', now);
      s.step = 'vinculo';
      return [
        {
          to: phone,
          text: 'Esse apartamento já tem cadastro. Você é:\n\n*1* da mesma família de quem já está cadastrado\n*2* novo morador (mudança)',
        },
      ];
    }
    case 'vinculo': {
      if (/^(1|fam[ií]lia|mesma fam[ií]lia)/i.test(t)) return submit(phone, s, 'familia', now);
      if (/^(2|novo|mudan[cç]a)/i.test(t)) return submit(phone, s, 'mudanca', now);
      return [{ to: phone, text: 'Responda *1* se é da mesma família ou *2* se é mudança.' }];
    }
  }
}

// Comandos de cadastro da administração. Devolve undefined se não for um deles.
export function runResidentCommand(text: string, by: string, now = new Date()): Outgoing[] | undefined {
  const m = text.trim().match(/^#(pendentes|aprovar|recusar)\b\s*(\S*)/i);
  if (!m) return undefined;
  const cmd = m[1].toLowerCase();

  if (cmd === 'pendentes') {
    const rows = listPending();
    if (rows.length === 0) return [{ to: by, text: 'Nenhum cadastro aguardando aprovação.' }];
    const lines = rows.map((r) => {
      const who = r.kind === 'familia' ? 'aguarda o responsável do apto' : r.kind === 'mudanca' ? 'mudança, aguarda você' : 'aguarda você';
      return `• ${r.code}: ${r.name}, ${unitLabel(r)} (${who})`;
    });
    return [{ to: by, text: `Cadastros pendentes:\n${lines.join('\n')}\n\nResponda #aprovar CÓDIGO ou #recusar CÓDIGO.` }];
  }

  const code = m[2];
  if (!code) return [{ to: by, text: `Qual código? Ex.: #${cmd} K7QM. Veja os códigos em #pendentes.` }];
  const approve = cmd === 'aprovar';
  const { resident: r, removed } = decide(code, approve, by, now);
  if (!r) return [{ to: by, text: `Não achei pedido pendente com o código ${code.toUpperCase()}. Veja #pendentes.` }];
  if (!approve) {
    return [
      { to: by, text: `Recusado: ${r.name}, ${unitLabel(r)}.` },
      { to: r.phone, text: 'A administração não confirmou seu cadastro. Se for engano, fale com eles pelo ramal 90.' },
    ];
  }
  const out: Outgoing[] = [{ to: by, text: `Aprovado: ${r.name}, ${unitLabel(r)}.${removed.length ? ` Saíram do cadastro do apto: ${removed.map((x) => x.name).join(', ')}.` : ''}` }];
  out.push({ to: r.phone, text: approvedText(r) });
  // Quem saiu fica sabendo: se a "mudança" for falsa, a família atual percebe na hora.
  for (const x of removed) {
    out.push({ to: x.phone, text: `Seu cadastro no ${unitLabel(x)} foi encerrado por mudança de morador. Se for engano, fale com a administração pelo ramal 90.` });
  }
  return out;
}

export function resetSessions() {
  sessions.clear();
}
