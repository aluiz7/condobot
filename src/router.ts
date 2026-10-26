import type { Tier } from './knowledge.ts';

// Escolhe quanto da base mandar ao modelo pela pergunta (e pelo fim da conversa, para "e no sábado?").
// Errar para menos não é grave: o modelo pede os documentos e a chamada é refeita com a base completa.
const strip = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Assuntos que só a convenção cobre: assembleia, voto, síndico, rateio, destinação das unidades.
const CONVENCAO = /assembl|reuniao|quorum|voto|votar|eleic|sindic[oa]|conselho|convenc|rateio|fracao|condomin[oi]o(s)? (inadimpl|quite)|inadimpl|propriet|inquilin|locat|alug(ar|uel) (o|a|meu|minha) (ap|vaga)|vend(er|a) (o|a|meu|minha)? ?(ap|vaga)|destina|residencial|comercial|culto|empresa|fachada|benfeitoria/;

// Regras de convivência, que estão no regimento.
const REGIMENTO = /pode|posso|proib|permit|regra|norma|multa|advert|notific|obra|reforma|barulh|\bsom\b|silencio|musica|festa|convidad|lista|reserv|antecedenc|cancel|chave|mudanc|carreto|entrega|carga|elevador|anima|cachorr|gato|\bpets?\b|focinh|garag|vaga|carro|moto|bicicl|patins|skate|lixo|visit|atestad|traje|roupa|fumar|cigarr|varand|janel|toldo|\brede\b|vazament|crianc|menor|idade|empregad|diarist|personal/;

export function pickTier(question: string, history: { text: string }[] = []): Tier {
  // A última pergunta do morador entra na conta: "e se for no domingo?" herda o assunto.
  const recent = history.filter((_, i) => i % 2 === 0).slice(-1).map((t) => t.text);
  const text = strip([...recent, question].join(' '));
  if (CONVENCAO.test(text)) return 'completa';
  if (REGIMENTO.test(text)) return 'regimento';
  return 'essencial';
}
