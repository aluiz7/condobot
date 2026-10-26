export type Turn = { role: 'user' | 'model'; text: string };

const MAX_TURNS = 10;
const TTL_MS = 24 * 60 * 60 * 1000;

// Memória da conversa por número, só em RAM: some quando o servidor reinicia. Suficiente para o piloto.
const conversations = new Map<string, { turns: Turn[]; updatedAt: number }>();

export function getHistory(phone: string, now = Date.now()): Turn[] {
  const conv = conversations.get(phone);
  if (!conv || now - conv.updatedAt > TTL_MS) {
    conversations.delete(phone);
    return [];
  }
  return conv.turns;
}

export function remember(phone: string, question: string, reply: string, now = Date.now()) {
  const turns = [...getHistory(phone, now), { role: 'user', text: question }, { role: 'model', text: reply }] as Turn[];
  conversations.set(phone, { turns: turns.slice(-MAX_TURNS), updatedAt: now });
}
