# condobot

Assistente de WhatsApp para os moradores do Condomínio Atlantis Park. O morador manda uma pergunta ("quanto custa o salão infantil no sábado?", "pode obra no domingo?") e o bot responde só com o que está na base do condomínio: tabela de horários e valores 2026, ramais, fichas das áreas comuns, regimento interno e convenção.

## Como funciona

```
WhatsApp ──► Meta (Cloud API) ──► POST /webhook ──► bot.ts ──► Gemini (prompt + base inteira)
                                                       │
                                                       └──► resposta ──► Meta ──► WhatsApp
```

- **Sem RAG.** A base inteira (~55 mil tokens) vai na instrução de sistema de cada chamada. O Gemini 2.5 aplica cache implícito no prefixo repetido, o que barateia as chamadas seguintes.
- **Prioridade das fontes:** tabela 2026 > fichas das áreas > regimento 2017 > convenção 2010. As regras estão em `src/prompt.ts`.
- **Histórico** em memória: últimas 10 trocas por número, por até 24h. Se o processo reiniciar, o histórico se perde, o que é aceitável no MVP.
- **Log** em `logs/interacoes-AAAA-MM.jsonl`, com o telefone pseudonimizado (hash). O log guarda pergunta, resposta, tokens, latência e se a resposta caiu no "não sei".
- **Allowlist:** durante o piloto, o bot só responde aos números de `ALLOWED_PHONES` e ao `SUPER_ADMIN_PHONE`.

## Estrutura

| Caminho | O que é |
| --- | --- |
| `src/app.ts` | Rotas HTTP: `/health` e `/webhook` (verificação e recebimento) |
| `src/bot.ts` | Fluxo de uma mensagem: allowlist, marcar como lida, gerar a resposta, enviar e logar |
| `src/llm.ts` | Chamada ao Gemini, com a data e a hora de Brasília injetadas na pergunta |
| `src/prompt.ts` | Prompt de sistema |
| `src/knowledge.ts` | Monta a base a partir de `base/` |
| `src/whatsapp.ts` | Envio, assinatura do webhook e parsing do payload |
| `src/phone.ts` | Normalização de número (nono dígito) e allowlist |
| `base/` | Base do condomínio, em Markdown. **Editar aqui atualiza o bot** (requer reiniciar o processo) |
| `tests/perguntas-reais.md` | 44 perguntas reais do grupo, com a resposta esperada |
| `scripts/eval.ts` | Roda as perguntas no modelo e gera um relatório |
| `scripts/check-meta.ts` | Confere o token e o número na Meta |

## Rodando localmente

Requer Node 22 ou superior.

```bash
npm install
cp .env.example .env   # preencha as variáveis
npm test               # testes de rota e de telefone (não chamam APIs)
npm run dev            # sobe em http://localhost:3000
```

Para a Meta alcançar sua máquina, exponha a porta com um túnel:

```bash
ngrok http 3000        # ou: cloudflared tunnel --url http://localhost:3000
```

### Variáveis de ambiente

| Variável | Obrigatória | Onde pegar |
| --- | --- | --- |
| `GEMINI_API_KEY` | sim | [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | não | Padrão `gemini-2.5-flash` |
| `ACCESS_TOKEN` | sim | Meta for Developers > app > WhatsApp > Configuração da API. Em produção, use o token permanente de um usuário do sistema (Business Manager > Usuários do sistema) |
| `PHONE_NUMBER_ID` | sim | Mesma tela, "Identificação do número de telefone" |
| `VERIFY_TOKEN` | sim | Um texto que você inventa e repete no cadastro do webhook |
| `APP_SECRET` | recomendado | App > Configurações > Básico > Chave secreta do aplicativo. Com ela, o servidor recusa chamadas que não vieram da Meta |
| `SUPER_ADMIN_PHONE` | sim | Seu número, só dígitos, com 55 e DDD |
| `ALLOWED_PHONES` | não | Números liberados no piloto, separados por vírgula. Vazio libera todos |
| `PORT` | não | Padrão 3000 |

## Configurando o webhook na Meta

1. Suba o servidor (local com túnel, ou já em produção).
2. Meta for Developers > seu app > WhatsApp > Configuração.
3. Em Webhook, clique em Editar:
   - URL de callback: `https://SEU-DOMINIO/webhook`
   - Token de verificação: o mesmo valor de `VERIFY_TOKEN`
4. Clique em Verificar e salvar. O servidor responde ao desafio da Meta.
5. Em Campos do webhook, assine **messages**.
6. Com o número de teste, cadastre até 5 destinatários em "Para" na tela de Configuração da API. Só esses números recebem resposta.
7. Mande "oi" de um número cadastrado e veja o log no terminal.

Para conferir o token e o número antes de tudo:

```bash
npm run check:meta
```

O script mostra se o token é válido, o tipo dele e quando expira (token permanente aparece sem expiração).

## Avaliando as respostas

```bash
npm run eval            # as 44 perguntas; exige faturamento ativo (o gratuito para na 20ª)
npm run eval -- 6 8 41  # só algumas perguntas
```

O relatório sai em `eval-results/`, com a resposta esperada ao lado da resposta do bot. A data fica fixa em uma terça-feira (`EVAL_NOW`, padrão `2026-10-27T10:00:00-03:00`) para que as perguntas com "hoje" sejam comparáveis entre rodadas. `EVAL_DELAY_MS` controla a pausa entre chamadas (padrão 16 s, por causa do limite do plano gratuito).

O que conta como falha grave: qualquer horário, valor ou telefone que não está na base, e qualquer afirmação sobre o estado do momento ("a piscina está aberta").

## Deploy

Qualquer serviço que rode Node com processo persistente serve. Recomendação para o piloto: **Railway** ou **Render** (deploy a partir do GitHub, HTTPS pronto).

1. Crie o serviço a partir deste repositório.
2. Comando de start: `npm start`. Não há build, o `tsx` roda o TypeScript direto.
3. Configure as variáveis de ambiente no painel do serviço, nunca no repositório.
4. Use a URL pública em `/webhook` no cadastro da Meta.
5. Teste `https://SEU-DOMINIO/health`.

Rode **uma instância só**. O histórico das conversas e a deduplicação das mensagens ficam em memória. Com duas instâncias, o bot pode responder duas vezes ou perder o contexto.

Os logs ficam no disco do container. Em Railway ou Render, o disco é apagado a cada deploy, a menos que você monte um volume persistente em `logs/`.

## Limites conhecidos

- **Plano gratuito do Gemini não aguenta nem o piloto.** No `gemini-2.5-flash` o limite é de **20 requisições por dia**, além de 5 por minuto e 250 mil tokens de entrada por minuto. Como cada pergunta leva ~55 mil tokens, o bot atende no máximo 4 mensagens por minuto e para de responder depois da 20ª do dia. Além disso, no plano gratuito o Google pode usar os dados para treinar modelos, o que conflita com a LGPD. Ative o faturamento no projeto do Google Cloud antes de abrir para moradores.
- **Horários de domingo** da piscina, da academia e dos correios ainda não estão na base. O bot diz que não tem a informação.
- **Telefone externo da administração** ainda não está na base.
- **Mensagens que não são texto** (áudio, foto) recebem um aviso de que o bot só entende texto.
- Fora da janela de 24h do WhatsApp, o bot não consegue iniciar conversa. Avisos da síndica vão exigir templates aprovados (etapa futura).
