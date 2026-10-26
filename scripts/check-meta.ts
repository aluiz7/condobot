// Mostra se o token da Meta é válido, de que tipo é e quando expira.
import { config } from '../src/config.ts';

const { graphVersion, accessToken, phoneNumberId } = config.whatsapp;
const token = accessToken();
const base = `https://graph.facebook.com/${graphVersion}`;

async function get(path: string) {
  const res = await fetch(`${base}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json() as Promise<any>;
}

const debug = (await get(`debug_token?input_token=${token}`)).data ?? {};
console.log('Token válido:', debug.is_valid ?? false);
console.log('Tipo:', debug.type ?? '?');
console.log('Expira em:', debug.expires_at ? new Date(debug.expires_at * 1000).toLocaleString('pt-BR') : 'nunca (token permanente)');
if (debug.error) console.log('Erro:', debug.error.message);

const phone = await get(`${phoneNumberId()}?fields=display_phone_number,verified_name,quality_rating`);
if (phone.error) console.log('Número:', phone.error.message);
else console.log('Número:', phone.display_phone_number, '-', phone.verified_name, '- qualidade', phone.quality_rating);
