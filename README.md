# condobot

Assistente de WhatsApp para os moradores do Condomínio Atlantis Park. O morador manda uma pergunta ("quanto custa o salão infantil no sábado?", "pode obra no domingo?") e o bot responde só com o que está na base do condomínio: tabela de horários e valores 2026, ramais, fichas das áreas comuns, regimento interno e convenção.

## Como funciona

```
WhatsApp ──► Meta (Cloud API) ──► POST /webhook ──► bot.ts ──► Gemini (prompt + base inteira)
                                                       │
                                                       └──► resposta ──► Meta ──► WhatsApp
```

- **Sem RAG.** A base inteira (~55 mil tokens) vai na instrução de sistema de cada chamada. O Gemini aplica cache implícito (na avaliação, ~80% dos tokens de entrada vieram do cache) no prefixo repetido, o que barateia as chamadas seguintes.
- **Prioridade das fontes:** tabela 2026 > fichas das áreas > regimento 2017 > convenção 2010. As regras estão em `src/prompt.ts`.
- **Histórico** em memória: últimas 10 trocas por número, por até 24h. Se o processo reiniciar, o histórico se perde, o que é aceitável no MVP.
- **Log** em `logs/interacoes-AAAA-MM.jsonl`, com o telefone pseudonimizado (hash). O log guarda pergunta, resposta, tokens, latência e se a resposta caiu no "não sei".
- **Uso no WhatsApp:** mostra "digitando…" enquanto pensa (renovado a cada 20 s), junta mensagens mandadas em sequência numa resposta só, entende áudio (transcreve antes de responder) e responde "oi" ou "menu" com uma apresentação fixa, sem chamar o modelo.
- **Status das áreas:** a síndica (e o super admin) marca uma área como fechada ou em manutenção pelo WhatsApp. O bot passa a responder isso aos moradores, com a previsão, e lembra quem registrou quando o prazo vence. Detalhes em [Comandos da administração](#comandos-da-administração).
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

Requer Node 22.5 ou superior (usa o `node:sqlite` nativo, que ainda emite um aviso de recurso experimental).

```bash
npm install
cp .env.example .env   # preencha as variáveis
npm test               # testes de rota e de telefone (não chamam APIs)
npm run dev            # sobe em http://localhost:3000
npm run chat           # conversa com o bot no terminal, sem WhatsApp
```

Para a Meta alcançar sua máquina, exponha a porta com um túnel:

```bash
ngrok http 3000        # ou: cloudflared tunnel --url http://localhost:3000
```

### Variáveis de ambiente

| Variável | Obrigatória | Onde pegar |
| --- | --- | --- |
| `GEMINI_API_KEY` | sim | [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | não | Padrão `gemini-3.5-flash-lite` |
| `GEMINI_THINKING_LEVEL` | não | Só modelos 3.x: `MINIMAL`, `LOW` (padrão), `MEDIUM`, `HIGH`. Nos 2.x vale `GEMINI_THINKING_BUDGET` (padrão 0) |
| `ACCESS_TOKEN` | sim | Meta for Developers > app > WhatsApp > Configuração da API. Em produção, use o token permanente de um usuário do sistema (Business Manager > Usuários do sistema) |
| `PHONE_NUMBER_ID` | sim | Mesma tela, "Identificação do número de telefone" |
| `VERIFY_TOKEN` | sim | Um texto que você inventa e repete no cadastro do webhook |
| `APP_SECRET` | recomendado | App > Configurações > Básico > Chave secreta do aplicativo. Com ela, o servidor recusa chamadas que não vieram da Meta |
| `SUPER_ADMIN_PHONE` | sim | Seu número, só dígitos, com 55 e DDD |
| `SINDICO_PHONES` | não | Números que podem usar os comandos de status, separados por vírgula. O super admin já pode |
| `DATA_DIR` | não | Pasta do banco SQLite com o status das áreas. Padrão `data` |
| `ALLOWED_PHONES` | não | Números liberados no piloto, separados por vírgula. Vazio libera todos |
| `DEBOUNCE_MS` | não | Espera depois da última mensagem antes de responder, para juntar mensagens picadas. Padrão 3000 |
| `PORT` | não | Padrão 3000 |

## Comandos da administração

Só funcionam a partir do `SUPER_ADMIN_PHONE` e dos `SINDICO_PHONES`. De qualquer outro número, o texto vai para o modelo como pergunta comum.

| Comando | O que faz |
| --- | --- |
| `#manutencao piscina até sexta 18h: troca do filtro` | Marca em manutenção, com previsão e motivo (ambos opcionais) |
| `#fechar salão adulto: evento da administração` | Marca como fechada |
| `#abrir piscina` | Remove o aviso; a área volta a seguir a tabela |
| `#status` | Lista os avisos ativos |
| `#ajuda` | Mostra esses comandos |

A área é texto livre (`elevador bloco 6` também vale). Prazos aceitos: `18h`, `amanhã`, `sexta 14h30`, `30/10`, `3 dias`, `2 horas`. Prazo só com o dia vence às 18h. Se o prazo não for reconhecido ("até a peça chegar"), ele aparece como foi escrito, sem lembrete.

Quando a previsão vence e o aviso continua, o bot manda um lembrete para quem registrou. Esse lembrete é texto livre, então só chega se a pessoa falou com o bot nas últimas 24h; fora disso, vai precisar de um template aprovado.

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

Os logs (`logs/`) e o banco do status das áreas (`data/`) ficam no disco do container. Em Railway ou Render, o disco é apagado a cada deploy: monte um volume persistente e aponte `LOG_DIR` e `DATA_DIR` para ele.

## Limites conhecidos

- **Plano gratuito do Gemini serve só para teste.** No `gemini-2.5-flash` e nos Flash 3.x o limite é de 20 requisições por dia; por isso o padrão é o `gemini-3.5-flash-lite`, que tem 500 por dia. Em todos, o teto de 250 mil tokens de entrada por minuto segura cerca de 4 perguntas por minuto, porque cada uma leva ~55 mil tokens. O Flash Lite também devolve 503 ("high demand") com frequência; o bot tenta de novo duas vezes antes de responder com erro. Além disso, no plano gratuito o Google pode usar os dados para treinar modelos, o que conflita com a LGPD. Ative o faturamento no projeto do Google Cloud antes de abrir para moradores.
- **Horários de domingo** da piscina, da academia e dos correios ainda não estão na base. O bot diz que não tem a informação.
- **Telefone externo da administração** ainda não está na base.
- **Foto, figurinha e documento** recebem um aviso de que o bot entende texto e áudio.
- **Latência:** no plano gratuito, o Flash Lite levou em média ~15 s por resposta, e áudio soma a transcrição (~25 s). Com faturamento ativo deve cair bastante, mas isso não foi medido.
- Fora da janela de 24h do WhatsApp, o bot não consegue iniciar conversa. Avisos da síndica vão exigir templates aprovados (etapa futura).
