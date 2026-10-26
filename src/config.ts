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
    model: optional('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
    // Usado na hora quando o principal responde 503 ("high demand"), em vez de esperar.
    fallbackModel: optional('GEMINI_FALLBACK_MODEL', 'gemini-3.1-flash-lite'),
    // Gemini 2.x usa thinkingBudget (0 desliga); a partir do 3.x é thinkingLevel e o budget dá erro 400.
    thinkingBudget: Number(optional('GEMINI_THINKING_BUDGET', '0')),
    thinkingLevel: optional('GEMINI_THINKING_LEVEL', 'LOW'),
  },
  whatsapp: {
    accessToken: () => required('ACCESS_TOKEN'),
    phoneNumberId: () => required('PHONE_NUMBER_ID'),
    verifyToken: () => required('VERIFY_TOKEN'),
    appSecret: optional('APP_SECRET'),
    graphVersion: optional('GRAPH_API_VERSION', 'v21.0'),
    // Trocável só para testes, que sobem uma Graph API falsa local.
    graphBaseUrl: optional('GRAPH_BASE_URL', 'https://graph.facebook.com'),
  },
  allowedPhones: optional('ALLOWED_PHONES')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
  superAdminPhone: optional('SUPER_ADMIN_PHONE'),
  // Números da síndica e de quem mais puder mudar o status das áreas (separados por vírgula).
  sindicoPhones: optional('SINDICO_PHONES')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
  // Acima disso, novos pedidos de família do mesmo apto vão para a administração, não para o responsável.
  maxPerUnit: Number(optional('MAX_MORADORES_POR_APTO', '6')),
  // Banco SQLite (status das áreas). Em produção, aponte para um volume persistente.
  dataDir: optional('DATA_DIR', 'data'),
  // Espera depois da última mensagem antes de responder, para juntar mensagens picadas numa resposta só.
  debounceMs: Number(optional('DEBOUNCE_MS', '3000')),
  logDir: optional('LOG_DIR', 'logs'),
  timezone: 'America/Sao_Paulo',
};
