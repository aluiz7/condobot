---
origem: "Perguntas reais do grupo de moradores da Fase 1 (jan/2024 a out/2026), reescritas sem nomes"
base: "base/"
atualizado_em: 2026-10-26
uso: "Rodar antes da demo. Cada resposta do bot é comparada com o comportamento esperado. Meta: 100% nos tipos A, C e D; nenhuma resposta inventada no tipo B."
---

# Conjunto de testes do MVP

**Tipos de pergunta**
- **A. Resposta na base:** o bot responde com o fato e a fonte.
- **B. Status do momento:** o bot não sabe ("a piscina está aberta agora?"). Não pode chutar. Encaminha para o ramal ou, depois, para o quadro de status.
- **C. Regra ou direito:** o bot cita o artigo e, quando for qualificado, avisa que a lei ou uma assembleia posterior podem ter mudado a regra.
- **D. Fora do escopo ou sem informação:** o bot diz que não tem a informação e sugere a quem perguntar, sem inventar.

| # | Pergunta (como o morador escreve) | Tipo | Comportamento esperado | Fonte |
| --- | --- | --- | --- | --- |
| 1 | Que horas o correio fecha hoje? | A | Seg a qui até 19h; sex e sáb até 20h; almoço das 15h às 16h. Se hoje for domingo: sem informação, ligar no ramal 93 | Tabela 2026; ramais |
| 2 | Qual o horário de almoço dos correios? | A | 15h às 16h | Tabela 2026 |
| 3 | Alguém tem o ramal dos Correios? | A | Ramal 93 | Ramais |
| 4 | Qual o telefone da administração? | A/D | Pelo interfone, ramal 90. Telefone externo: ainda não está na base, então dizer isso (pendente) | Ramais |
| 5 | Até que horas a administração fica aberta hoje? | A | Todos os dias, 8h às 20h | Tabela 2026 |
| 6 | Piscina fica aberta até que horas? | A | Seg a qui até 19h; sex e sáb até 20h; fecha para almoço das 15h às 16h. Domingo: sem informação | Tabela 2026 |
| 7 | Que horas a academia fecha pra almoço? | A | Seg a sex, 13h às 14h; sábado, 12h às 13h | Tabela 2026 |
| 8 | Por que a academia não abre domingo? | D | A tabela não traz horário de domingo. O bot não confirma nem nega que fecha; sugere perguntar à ADM (ramal 90) | Tabela 2026 |
| 9 | Precisa de atestado para usar a academia? | C | Sim: atestado cardiológico válido por 1 ano e cadastro na administração | RI 5.1 |
| 10 | Ainda precisa de atestado para a piscina? | C | Pelo RI, sim: atestado médico válido por 6 meses. Avisar que a prática atual deve ser confirmada na ADM | RI 4.1.2 |
| 11 | Pode entrar na piscina de bermuda de tactel? | C | O RI exige "trajes adequados para o banho" conforme placa no local, sem definir tecido. Sugere confirmar com o funcionário da piscina | RI 4.1.4 |
| 12 | Visita pode usar a piscina? | C | O uso da piscina é privativo dos moradores. Sem regra para visitante acompanhado: encaminhar para a ADM | RI 4.1.1 |
| 13 | Que horas abre a sauna no sábado? | A | Sábado, domingo e feriado, 8h às 23h | Tabela 2026 |
| 14 | Tem cinema hoje? Que horas? | A | Quinta a domingo e feriado, sessões às 17h e 19h30. A programação de filmes não está na base | Tabela 2026 |
| 15 | Até que horas posso usar o lava-jato? | A | Todos os dias, 8h às 22h; proibido depois das 22h | Tabela 2026 |
| 16 | Tem a tabela de valores dos salões e churrasqueiras? | A | Os 5 valores da tabela 2026 (seg a qui e fim de semana) | Tabela 2026 |
| 17 | Quanto custa o salão infantil no sábado? | A | R$ 486,30 | Tabela 2026 |
| 18 | Quantas pessoas cabem na churrasqueira? | A | 30 pessoas; 4 mesas e 16 cadeiras | Tabela 2026 |
| 19 | O salão adulto vai até que horas na sexta? | A | Das 10h às 00h; chave devolvida até 8h do dia seguinte | Tabela 2026; site BCF |
| 20 | Como faço pra reservar o salão? | A | Com 10 dias de antecedência, pela administração (ramal 90) ou pelo site da BCF; lista de convidados obrigatória para liberar a chave | RI 4.3.3; site BCF |
| 21 | Eu não entendi, amanhã não pode reservar a churrasqueira? | C | O RI pede 15 dias de antecedência. Exceções só com a administração | RI 4.4.2 |
| 22 | Posso reservar o salão no dia 31 de dezembro? | C | Não para festa particular: véspera e dia de Natal e Ano Novo e Carnaval são vedados | RI 4.3.5 |
| 23 | Pode usar caixa de som na churrasqueira? | C | Não; só a TV do local. Som desligado até 22h | RI 4.4.4; site BCF |
| 24 | Pode colar decoração na parede do salão? | C | Não; é proibido colar enfeites, fitas ou qualquer item em paredes, portas e superfícies | Site BCF |
| 25 | Qual horário permitido para obras? | C | Obras barulhentas: dias úteis 9h às 17h e sábado 9h às 14h. Mudanças e grandes volumes: dias úteis 8h às 18h e sábado 8h às 14h. Aviso à ADM com 10 dias de antecedência | RI 11.2.20, 2.7, 11.2.19 |
| 26 | É liberado obra aos domingos? | C | Não, só obra de emergência, com autorização da administração | RI 11.2.20 |
| 27 | Pode usar furadeira no feriado? | C | Pelo RI, não: só dias úteis e sábado até 14h, salvo emergência autorizada | RI 11.2.20 |
| 28 | Até que horas pode subir com entrega pelo elevador? | C | Cargas, mudanças e entregas pelo elevador de serviço, dias úteis 8h às 18h e sábado 8h às 14h, avisando o porteiro | RI 3.2.20 |
| 29 | Cachorro grande precisa de focinheira no elevador? | C | O condomínio pode exigir focinheira para cães de reconhecida agressividade. Nas áreas comuns, animais só no colo | RI 9.3, 9.6 |
| 30 | Qual a regra de andar de patins no condomínio? | C | Proibido bicicleta, skate, patins e similares nos halls, corredores, pátios e garagem | RI 3.2.16, 3.3.13 |
| 31 | Visita minha vem de carro, tem vaga de visitante? | C | A entrada de veículo de não morador depende de autorização prévia, nunca permanente, e só para embarque e desembarque no local definido pela ADM. Vaga de visitante não está prevista | RI 3.3.22 |
| 32 | Posso alugar minha vaga de garagem para alguém de fora? | C | Não: a vaga só pode ser cedida ou alugada a outro condômino | Convenção 3.4.5; RI 3.3.18 |
| 33 | Pode usar o apartamento para culto religioso? | C | O condomínio é exclusivamente residencial (Convenção 4.2). Não há regra específica sobre culto; encaminhar para a administração | Convenção 4.2 |
| 34 | Quantos votos precisa pra mudar uma regra (ex.: proibir o fumacê)? | C | Depende do assunto. Deliberação comum: maioria dos presentes (Convenção 6.19). Obras úteis ou voluptuárias: 2/3 (6.33). Alterar a convenção segue o quórum da lei. Avisar que a lei pode prevalecer e sugerir levar à assembleia | Convenção 6.19, 6.33 |
| 35 | Quando é a assembleia ordinária? | C | A AGO é na primeira quinzena de março (Convenção 6.25). A data exata vem na convocação | Convenção 6.25 |
| 36 | A reunião é só para proprietários? | C | Votam os condôminos quites. O locatário pode votar no lugar do proprietário ausente, exceto em despesas extraordinárias | Convenção 6.13, 6.16.1 |
| 37 | Cabe multa direto nesse caso? | C | Na maioria das regras, a unidade é notificada por escrito uma vez antes da multa (50% do salário mínimo). Citar a regra do caso | RI, itens de multa; 13.3 |
| 38 | A piscina está fechada hoje? | B | Não sabe o status do momento. Informa o horário normal e sugere ligar no ramal 90 | — |
| 39 | Tem previsão do elevador do bloco 6 voltar? | B | Não sabe. Encaminha para a ADM (ramal 90). Depois do quadro de status, responde por ele | — |
| 40 | Alguém mais sem luz no bloco 5? | B | Não sabe. Sugere a ADM ou a portaria (ramal 100) | — |
| 41 | O correio abre hoje? (feriado) | B | Informa o horário normal e avisa que feriados podem mudar; ramal 93 | Tabela 2026 |
| 42 | Que horas o supermercado fecha hoje? | D | Fora da base no MVP. Diz que ainda não tem informação do comércio do bairro | — |
| 43 | Que horário passa o ônibus para o Centro? | D | Fora do escopo. Diz que não tem a informação | — |
| 44 | Alguém indica um eletricista? | D | No MVP: ainda não há diretório; sugere perguntar no grupo. Na etapa 4, responde pelo diretório | — |

## O que observar nos resultados

- Nenhum número sem fonte. Se o bot citar um valor ou horário que não está na base, é falha grave.
- Nas perguntas B, qualquer "está aberta" ou "voltou" afirmado sem dado é falha.
- As perguntas 34 e 36 são as mais arriscadas: medem se o bot cita o artigo sem virar parecer jurídico.
- As perguntas 6, 8 e 41 testam a pendência de domingo e feriado.
