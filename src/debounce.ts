// Junta as mensagens que a mesma pessoa manda em sequência ("oi" / "uma dúvida" / "o salão infantil...")
// e entrega todas de uma vez, depois de alguns segundos sem mensagem nova.
export function createDebouncer<T>(delayMs: number, flush: (key: string, items: T[]) => Promise<void>) {
  const pending = new Map<string, { items: T[]; timer: NodeJS.Timeout }>();

  return function push(key: string, item: T) {
    const entry = pending.get(key) ?? { items: [], timer: undefined as unknown as NodeJS.Timeout };
    clearTimeout(entry.timer);
    entry.items.push(item);
    entry.timer = setTimeout(() => {
      pending.delete(key);
      flush(key, entry.items).catch((err) => console.error('erro ao responder', err));
    }, delayMs);
    pending.set(key, entry);
  };
}
