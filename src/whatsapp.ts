import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.ts';

export type IncomingMessage = { id: string; from: string; type: string; text?: string };

const MAX_LENGTH = 4096;

function endpoint() {
  const { graphVersion, phoneNumberId } = config.whatsapp;
  return `https://graph.facebook.com/${graphVersion}/${phoneNumberId()}/messages`;
}

async function post(body: object) {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
}

export async function sendText(to: string, text: string) {
  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    await post({ to, type: 'text', text: { body: text.slice(i, i + MAX_LENGTH), preview_url: false } });
  }
}

export async function markAsRead(messageId: string) {
  await post({ status: 'read', message_id: messageId });
}

export function verifySignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = header.slice('sha256='.length);
  return received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// Extrai as mensagens de um payload de webhook. Status de entrega e outros eventos são ignorados.
export function extractMessages(payload: any): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const m of change?.value?.messages ?? []) {
        messages.push({ id: m.id, from: m.from, type: m.type, text: m.text?.body });
      }
    }
  }
  return messages;
}
