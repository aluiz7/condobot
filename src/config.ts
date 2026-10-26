function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ${name} não definida (veja .env.example)`);
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  port: Number(optional('PORT', '3000')),
  gemini: {
    apiKey: () => required('GEMINI_API_KEY'),
    model: optional('GEMINI_MODEL', 'gemini-2.5-flash'),
    thinkingBudget: Number(optional('GEMINI_THINKING_BUDGET', '0')),
  },
  whatsapp: {
    accessToken: () => required('ACCESS_TOKEN'),
    phoneNumberId: () => required('PHONE_NUMBER_ID'),
    verifyToken: () => required('VERIFY_TOKEN'),
    appSecret: optional('APP_SECRET'),
    graphVersion: optional('GRAPH_API_VERSION', 'v21.0'),
  },
  allowedPhones: optional('ALLOWED_PHONES')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
  superAdminPhone: optional('SUPER_ADMIN_PHONE'),
  logDir: optional('LOG_DIR', 'logs'),
  timezone: 'America/Sao_Paulo',
};
