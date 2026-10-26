// Celulares brasileiros chegam da Meta às vezes sem o nono dígito (55 21 9XXXX-XXXX vira 55 21 XXXX-XXXX).
// Normaliza para a forma com o 9 antes de comparar.
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 12 && /[6-9]/.test(digits[4])) {
    return digits.slice(0, 4) + '9' + digits.slice(4);
  }
  return digits;
}

export function isAllowed(phone: string, allowed: string[], superAdmin = ''): boolean {
  if (allowed.length === 0) return true;
  const target = normalizePhone(phone);
  return [...allowed, superAdmin].filter(Boolean).some((p) => normalizePhone(p) === target);
}

export function isOneOf(phone: string, list: string[]): boolean {
  const target = normalizePhone(phone);
  return list.filter(Boolean).some((p) => normalizePhone(p) === target);
}
