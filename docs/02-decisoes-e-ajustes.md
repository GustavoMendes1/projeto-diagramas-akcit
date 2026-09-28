# Decisões e ajustes sobre o que a GenAI gerou

O desenho foi conferido contra as regras e prioridades do [prompt](../prompts/arquiteto-de-software.md). Cada linha abaixo registra o ponto de atenção, o ajuste e o raciocínio.

> **[COMPLETAR]** Este documento registra a revisão do rascunho contra as regras do prompt. Acrescente aqui as divergências reais que você identificar ao comparar a saída do modelo com o seu conhecimento do sistema, com o motivo de cada mudança.

## Ajustes

### 1. Gateway de Canais em vez de chamada direta ao provedor
**Ponto de atenção:** rascunhos de sistemas de mensageria tendem a ligar o portal ao SDK de um BSP.
**Ajuste:** camada de abstração com um adaptador por provedor. Retry, circuit breaker e fallback vivem ali.
**Por quê:** provedores mudam, caem ou têm custos distintos por canal. Trocar de BSP deve custar um adaptador, não uma reescrita.

### 2. Consentimento como serviço e ledger próprios
**Ponto de atenção:** opt-in tratado como filtro no serviço de audiência.
**Ajuste:** Serviço de Consentimento com ledger append-only, consultado pelo Orquestrador e atualizado por respostas de opt-out.
**Por quê:** consentimento é a prioridade nº 1 e precisa de histórico, origem e timestamp. Um flag booleano no cadastro do contato não prova nada em auditoria.

### 3. Fluxo orientado a eventos
**Ponto de atenção:** API chamando o provedor de forma síncrona.
**Ajuste:** Scheduler publica `CampaignDispatchRequested`; o Orquestrador expande; Workers consomem `SendMessage`.
**Por quê:** campanha e disparo têm escalas e modos de falha diferentes. Um pico de envio não pode derrubar a tela de aprovação.

### 4. Idempotência
**Ponto de atenção:** ausência de controle de duplicidade.
**Ajuste:** `idempotency_key` gerada na criação da mensagem e reserva no ledger antes de chamar o provedor.
**Por quê:** reentrega de fila e retry são comportamento normal. Sem chave, uma falha vira duplo disparo, com custo e risco de reclamação de spam.

### 5. Controle de Quotas explícito
**Ponto de atenção:** rate limit tratado como detalhe do worker.
**Ajuste:** componente próprio com decisão explícita (permitir ou negar) e reenfileiramento com atraso.
**Por quê:** tier do WhatsApp, qualidade da conta e status do agente RCS são restrições de desenho. Estourar o limite pode degradar a qualidade da conta e afetar todas as campanhas.

### 6. Webhooks assíncronos
**Ponto de atenção:** webhook processado no mesmo request de entrada.
**Ajuste:** Ingestor valida assinatura, persiste o payload bruto e responde 200; o Processador de Status trabalha de forma assíncrona e tolerante a ordem.
**Por quê:** provedores reenviam webhooks em caso de timeout, e eventos chegam duplicados ou fora de ordem. O estado da mensagem só avança, nunca regride.

### 7. Fallback condicionado a consentimento
**Ponto de atenção:** fallback automático RCS para WhatsApp.
**Ajuste:** a mensagem original termina em `SUBSTITUIDA_POR_FALLBACK`; a nova nasce em `CRIADA`, com nova `idempotency_key` e nova checagem de consentimento no canal alternativo.
**Por quê:** consentimento é por canal. Conformidade tem prioridade sobre entrega.

### 8. Diagrama de estados da mensagem
**Ponto de atenção:** a sequência mostra o fluxo, mas não as transições proibidas.
**Ajuste:** diagrama de estados com terminais explícitos (`BLOQUEADA_CONSENTIMENTO`, `SUBSTITUIDA_POR_FALLBACK`, `EXPIRADA`, `FALHOU`).
**Por quê:** torna as invariantes 1, 6 e 7 visíveis para quem for implementar.

### 9. `flowchart` em vez de `C4Container`
**Ponto de atenção:** a sintaxe C4 nativa do Mermaid.
**Ajuste:** `flowchart` com `classDef` na paleta do C4.
**Por quê:** a sintaxe C4 é experimental e o layout é instável. Diagrama que não renderiza onde a documentação vive não é documentação.

## O que foi mantido

- Decomposição em domínios de campanha e execução, com broker entre eles.
- Scheduler como container próprio.
- Ledger append-only para consentimento e auditoria (`[A VALIDAR]`, ver [ADR-001](../adr/ADR-001-ledger-consentimento-append-only.md)).

## Em aberto

- As premissas da [descrição](01-descricao-sistema.md#7-lacunas-e-premissas) não foram validadas.
- Janela de 24h e envio de templates fora da janela estão resumidos em "Controle de Quotas" e merecem diagrama próprio.
- Retenção e imutabilidade da trilha dependem de parecer jurídico.
- Tecnologias dos containers estão como `a definir`.
