# Portal de Mensagens Proativas (RCS e WhatsApp) — documentação como código

Base de documentação arquitetural de um portal web para **criar, aprovar, agendar, disparar e acompanhar campanhas de mensagens proativas** via RCS e WhatsApp Business API — construída como exercício de *discovery* de documentação com apoio de GenAI.

> **[COMPLETAR]** Contexto do projeto: de onde vem o sistema, quem são os usuários reais e qual problema ele resolve hoje. Esta seção deve ser escrita por quem conhece o cenário; o restante do repositório parte das premissas listadas em [`docs/01-descricao-sistema.md`](docs/01-descricao-sistema.md).

**Os diagramas são código.** Ficam em `docs/diagramas/*.mmd`, são versionados, revisáveis em *pull request* e reproduzíveis — e, por estarem em texto, servem de contexto para agentes de desenvolvimento implementarem o sistema com aderência à arquitetura documentada.

---

## Índice

| Documento | O que contém |
| --- | --- |
| [`docs/01-descricao-sistema.md`](docs/01-descricao-sistema.md) | Escopo, nível da visão, limites e responsabilidades, integrações, restrições, invariantes e lacunas |
| [`docs/02-decisoes-e-ajustes.md`](docs/02-decisoes-e-ajustes.md) | O que a GenAI gerou, o que foi ajustado e por quê |
| [`prompts/arquiteto-de-software.md`](prompts/arquiteto-de-software.md) | O prompt usado no *discovery*, versionado como artefato do projeto |
| [`adr/`](adr) | Decisões arquiteturais registradas |
| [`docs/diagramas/`](docs/diagramas) | Fonte dos diagramas em Mermaid (`.mmd`) |

---

## O sistema em um parágrafo

O portal centraliza o ciclo de vida de campanhas de mensagens proativas para times de negócio e marketing: criação, aprovação, agendamento, disparo, rastreamento de entrega, leitura, resposta e erro. Ele **não** aprova templates junto à Meta ou às operadoras, **não** define regras de negócio de marketing, **não** decide qual BSP contratar e **não** substitui análise jurídica de LGPD: consome provedores externos por uma camada de abstração e executa a política de consentimento e de quotas definida pelo negócio e pela conformidade. A pergunta que precisa responder a qualquer momento é: *quem recebeu o quê, por qual canal, com qual consentimento, e em que estado está.*

Descrição completa em [`docs/01-descricao-sistema.md`](docs/01-descricao-sistema.md).

**Ordem de prioridade em caso de conflito:** conformidade/consentimento > confiabilidade de entrega > rastreabilidade/auditoria > performance > custo por mensagem.

### Invariantes

Regras que nenhuma implementação pode violar. Estão aqui no README, e não só na descrição, porque são o critério de aceitação de qualquer mudança — humana ou gerada por agente.

1. Nenhuma mensagem é enviada sem consentimento vigente no canal de destino, verificado no ledger no momento do envio.
2. Todo envio tem `idempotency_key` única. Retry nunca gera segundo disparo.
3. Nenhuma chamada a provedor acontece fora do Gateway de Canais.
4. Toda decisão de quota é explícita. Sem quota, a mensagem é reenfileirada com atraso; o limite nunca é ignorado nem a mensagem descartada em silêncio.
5. Todo webhook é persistido antes de ser confirmado (200) ao provedor.
6. Fallback de canal só ocorre com consentimento no canal alternativo.
7. Status de mensagem nunca regride. Webhook fora de ordem não desfaz `ENTREGUE` ou `LIDA`.
8. Os ledgers de consentimento e de auditoria não aceitam `UPDATE` nem `DELETE`.

---

## Diagramas

### 1. Contexto — nível 1 do C4

A plataforma como caixa preta. Quem interage com ela e de quais sistemas ela depende. Público: negócio, conformidade e gerência.

<!-- diagrama:c4-contexto:inicio -->
```mermaid
---
title: Nível 1 — Contexto (C4) — Portal de Mensagens Proativas
---
flowchart TB
    subgraph ext_pessoas[" "]
        direction LR
        operador["<b>Operador de Marketing</b><br/>Cria, agenda e acompanha campanhas"]
        aprovador["<b>Aprovador</b><br/>Aprova campanhas antes do disparo"]
        admin["<b>Administrador</b><br/>Gerencia canais, quotas e acessos"]
        conformidade["<b>Conformidade / Auditoria</b><br/>Consulta consentimento e trilha de envios"]
    end

    destinatario(["<b>Destinatário</b><br/>Recebe mensagens, responde<br/>e pode fazer opt-out"])

    plataforma["<b>Portal de Mensagens Proativas</b><br/>[Sistema]<br/>Cria, agenda e dispara campanhas via RCS e WhatsApp.<br/>Controla consentimento, quotas e status de entrega.<br/>Mantém trilha de auditoria imutável."]

    wa["<b>BSP WhatsApp Business</b><br/>[Sistema externo]<br/>Envio de templates e mensagens;<br/>webhooks de status e respostas"]
    rcs["<b>Agregador / Operadoras RCS</b><br/>[Sistema externo]<br/>Envio RCS; webhooks<br/>de entrega e leitura"]
    idp["<b>Provedor de Identidade</b><br/>[Sistema externo]<br/>SSO e papéis de acesso"]
    crm["<b>CRM / CDP</b><br/>[Sistema externo]<br/>Fonte de contatos e segmentos"]

    operador -->|"Cria e agenda campanhas;<br/>acompanha resultados"| plataforma
    aprovador -->|"Aprova ou nega"| plataforma
    admin -->|"Configura canais e limites"| plataforma
    conformidade -->|"Consulta consentimento<br/>e trilha de envios"| plataforma

    plataforma -->|"Envia mensagens;<br/>recebe webhooks"| wa
    plataforma -->|"Envia mensagens;<br/>recebe webhooks"| rcs
    plataforma -->|"Autentica via SSO"| idp
    crm -->|"Contatos e segmentos"| plataforma

    wa -.->|"Entrega e resposta"| destinatario
    rcs -.->|"Entrega e resposta"| destinatario

    classDef pessoa fill:#08427b,stroke:#052e56,color:#fff
    classDef sistema fill:#1168bd,stroke:#0b4884,color:#fff
    classDef externo fill:#999999,stroke:#6b6b6b,color:#fff
    class operador,aprovador,admin,conformidade,destinatario pessoa
    class plataforma sistema
    class wa,rcs,idp,crm externo
    style ext_pessoas fill:none,stroke:none
```
<!-- diagrama:c4-contexto:fim -->

### 2. Containers — nível 2 do C4 *(estrutural)*

Unidades executáveis e como se comunicam. Público: quem vai implementar.

Dois pontos que valem leitura atenta: o **Domínio de Campanha** só publica um evento no broker, porque criar e aprovar campanha é de baixo volume e consistência forte, enquanto disparar é de alto volume e assíncrono; e o **Ledger de Consentimento** é um container próprio, separado do banco de campanhas, porque é *append-only* e consultado antes de todo envio. As tecnologias estão como `a definir` porque a stack do time não foi informada (ver lacunas).

<!-- diagrama:c4-containers:inicio -->
```mermaid
---
title: Nível 2 — Containers (C4) — Portal de Mensagens Proativas
---
flowchart LR
    operador(["<b>Operador / Aprovador</b><br/>[Pessoa]"])
    conformidade(["<b>Conformidade / Auditoria</b><br/>[Pessoa]"])

    subgraph campanha["Domínio de Campanha (controle)"]
        direction TB
        web["<b>Portal Web</b><br/>[Container: SPA — a definir]<br/>Templates, segmentos, aprovação,<br/>agendamento e painéis"]
        api["<b>API de Campanhas</b><br/>[Container: a definir]<br/>Regras de campanha, aprovação<br/>e consulta de resultados"]
        sched["<b>Scheduler</b><br/>[Container: a definir]<br/>Dispara campanhas na janela agendada"]
        campdb[("<b>DB de Campanhas</b><br/>[Container: a definir]<br/>Campanhas, templates, segmentos")]
    end

    subgraph consent["Consentimento"]
        direction TB
        cons["<b>Serviço de Consentimento</b><br/>[Container: a definir]<br/>Opt-in, opt-out e preferências<br/>por contato e canal"]
        condb[("<b>Ledger de Consentimento</b><br/>[Container: append-only]<br/>Histórico com origem e timestamp")]
    end

    bus{{"<b>Broker de Eventos e Filas</b><br/>[Container: a definir]<br/>Desacopla campanha de execução;<br/>garante retentativa"}}

    subgraph execucao["Domínio de Execução (disparo)"]
        direction TB
        orq["<b>Orquestrador de Disparo</b><br/>Expande campanha em mensagens<br/>e filtra por consentimento"]
        quota["<b>Controle de Quotas</b><br/>Tier WhatsApp, limites RCS,<br/>janela de 24h"]
        worker["<b>Send Workers</b><br/>Envio idempotente"]
        gw["<b>Gateway de Canais</b><br/>Adaptadores por provedor;<br/>retry, circuit breaker, fallback"]
        whk["<b>Webhook Ingestor</b><br/>Valida assinatura, persiste<br/>e responde 200"]
        stp["<b>Processador de Status</b><br/>Entrega, leitura, falha e respostas"]
        msgdb[("<b>Ledger de Mensagens</b><br/>[Container: a definir]<br/>Envios e eventos de status")]
    end

    audit[("<b>Trilha de Auditoria</b><br/>[Container: append-only]<br/>Sem UPDATE nem DELETE")]
    obs["<b>Observabilidade</b><br/>Métricas, logs e alertas"]

    idp["<b>Provedor de Identidade</b><br/>[Sistema externo]"]
    wa["<b>BSP WhatsApp</b><br/>[Sistema externo]"]
    rcs["<b>Agregador RCS</b><br/>[Sistema externo]"]

    operador -->|"HTTPS"| web
    conformidade -->|"HTTPS"| web
    web -->|"JSON/HTTPS"| api
    web -.->|"SSO"| idp
    api --> campdb
    api --> sched
    api -->|"Consulta e registra"| cons
    cons --> condb
    api -->|"Consulta resultados"| msgdb

    sched -->|"CampaignDispatchRequested"| bus
    bus --> orq
    orq -->|"Elegíveis"| cons
    orq -->|"Cria mensagens PENDING"| msgdb
    orq -->|"SendMessage"| bus
    bus --> worker
    worker -->|"Pede permissão"| quota
    worker -->|"Reserva por idempotency_key"| msgdb
    worker --> gw
    gw --> wa
    gw --> rcs

    wa -->|"Webhooks"| whk
    rcs -->|"Webhooks"| whk
    whk -->|"ProviderStatusReceived"| bus
    bus --> stp
    stp --> msgdb
    stp -->|"Opt-out por resposta"| cons

    worker -.-> obs
    gw -.-> obs
    whk -.-> obs
    stp -.-> obs
    api -.-> audit
    cons -.-> audit
    stp -.-> audit

    classDef pessoa fill:#08427b,stroke:#052e56,color:#fff
    classDef container fill:#438dd5,stroke:#2e6295,color:#fff
    classDef store fill:#438dd5,stroke:#2e6295,color:#fff
    classDef externo fill:#999999,stroke:#6b6b6b,color:#fff
    class operador,conformidade pessoa
    class web,api,sched,cons,orq,quota,worker,gw,whk,stp,obs container
    class campdb,condb,msgdb,audit,bus store
    class idp,wa,rcs externo
```
<!-- diagrama:c4-containers:fim -->

### 3. Sequência — jornada crítica *(comportamental)*

Da campanha agendada até a leitura pelo destinatário. O diagrama inclui de propósito os caminhos que não são felizes: mensagem duplicada, quota negada, falha do provedor com retry e fallback condicionado a consentimento, e opt-out recebido por resposta.

<!-- diagrama:sequencia-disparo-campanha:inicio -->
```mermaid
---
title: Jornada crítica — Do agendamento à entrega e leitura
---
sequenceDiagram
    autonumber
    actor Op as Operador
    participant API as API de Campanhas
    participant Sch as Scheduler
    participant Bus as Broker
    participant Orq as Orquestrador
    participant Con as Consentimento
    participant DB as Ledger de Mensagens
    participant W as Send Worker
    participant Q as Controle de Quotas
    participant GW as Gateway de Canais
    participant P as Provedor (BSP ou RCS)
    participant Whk as Webhook Ingestor
    participant St as Processador de Status

    Op->>API: Cria campanha (template, segmento, canal, janela)
    API->>API: Valida template aprovado e canal habilitado
    Op->>API: Aprova e agenda
    API->>Sch: Registra agendamento
    Note over API,Sch: Fim do fluxo de campanha.<br/>Nenhuma mensagem existe ainda.

    Sch->>Bus: Publica CampaignDispatchRequested
    Bus->>Orq: Entrega evento
    Orq->>Con: Solicita destinatários com opt-in vigente
    Con-->>Orq: Lista elegível (opt-outs removidos)
    Orq->>DB: Cria mensagens PENDING com idempotency_key
    Orq->>Bus: Publica SendMessage em lotes

    Bus->>W: Entrega SendMessage
    W->>DB: Reserva envio pela idempotency_key
    alt Mensagem já reservada ou enviada
        DB-->>W: Duplicada
        W->>Bus: Ack e descarta
    else Mensagem nova
        W->>Q: Solicita permissão (tier, limite, janela)
        alt Sem quota disponível
            Q-->>W: Negado
            W->>Bus: Reenfileira com atraso
        else Quota autorizada
            W->>GW: Envia mensagem com idempotency_key
            GW->>P: Requisição de envio
            alt Falha ou timeout do provedor
                P--xGW: Erro
                GW->>GW: Retry com backoff e circuit breaker
                opt Fallback habilitado e consentimento no canal alternativo
                    GW->>Bus: Publica nova mensagem no canal alternativo
                end
            else Aceita pelo provedor
                P-->>GW: provider_message_id
                GW-->>W: Aceita
                W->>DB: Atualiza para ACEITA com provider_message_id
            end
        end
    end

    Note over P,Whk: Assíncrono, segundos ou minutos depois
    P->>Whk: Webhook (delivered, read, failed, reply)
    Whk->>Whk: Valida assinatura e persiste payload bruto
    Whk-->>P: 200 imediato
    Whk->>Bus: Publica ProviderStatusReceived
    Bus->>St: Entrega evento
    St->>DB: Atualiza status (idempotente, tolerante a ordem)
    opt Resposta indica opt-out
        St->>Con: Registra opt-out com origem e timestamp
    end
```
<!-- diagrama:sequencia-disparo-campanha:fim -->

### 4. Estados — ciclo de vida da mensagem *(comportamental)*

Diagrama adicionado na revisão, não na primeira geração: é ele que torna as invariantes visíveis. `BLOQUEADA_CONSENTIMENTO` e `SUBSTITUIDA_POR_FALLBACK` são estados terminais e explícitos justamente para que nenhuma implementação futura os trate como caminho para o envio.

<!-- diagrama:estado-mensagem:inicio -->
```mermaid
---
title: Ciclo de vida de uma mensagem
---
stateDiagram-v2
    direction TB
    [*] --> CRIADA: orquestrador expande a campanha

    CRIADA --> BLOQUEADA_CONSENTIMENTO: sem opt-in vigente no canal
    CRIADA --> ENFILEIRADA: elegível

    ENFILEIRADA --> ENVIANDO: reserva por idempotency_key
    ENFILEIRADA --> AGUARDANDO_QUOTA: quota negada
    AGUARDANDO_QUOTA --> ENFILEIRADA: quota liberada
    AGUARDANDO_QUOTA --> EXPIRADA: janela de envio vencida

    ENVIANDO --> ENFILEIRADA: erro transitório, retry com backoff
    ENVIANDO --> ACEITA: provedor aceitou
    ENVIANDO --> SUBSTITUIDA_POR_FALLBACK: falha definitiva e fallback consentido
    ENVIANDO --> FALHOU: falha definitiva sem fallback

    ACEITA --> ENTREGUE: webhook delivered
    ACEITA --> FALHOU: webhook failed
    ENTREGUE --> LIDA: webhook read
    ENTREGUE --> RESPONDIDA: resposta do destinatário
    LIDA --> RESPONDIDA: resposta do destinatário

    BLOQUEADA_CONSENTIMENTO --> [*]
    EXPIRADA --> [*]
    SUBSTITUIDA_POR_FALLBACK --> [*]
    FALHOU --> [*]
    ENTREGUE --> [*]
    LIDA --> [*]
    RESPONDIDA --> [*]

    note right of BLOQUEADA_CONSENTIMENTO
        Terminal e explícito.
        Sem consentimento, não há envio.
    end note

    note right of SUBSTITUIDA_POR_FALLBACK
        A mensagem original termina aqui.
        O fallback nasce como nova mensagem
        em CRIADA, com nova idempotency_key
        e nova checagem de consentimento.
    end note

    note right of ENTREGUE
        Status nunca regride. Webhook fora
        de ordem não move ENTREGUE para ACEITA.
    end note
```
<!-- diagrama:estado-mensagem:fim -->

---

## Decisões e ajustes sobre o que a GenAI gerou

Resumo. Íntegra, com o raciocínio de cada uma, em [`docs/02-decisoes-e-ajustes.md`](docs/02-decisoes-e-ajustes.md).

> **[COMPLETAR]** A tabela abaixo registra a revisão do rascunho contra as regras do prompt. Substitua ou acrescente linhas com as divergências reais que você observar ao comparar a saída do modelo com o seu conhecimento do sistema.

| # | O que o rascunho tendia a trazer | O que foi ajustado | Por quê |
| --- | --- | --- | --- |
| 1 | Portal chamando o provedor diretamente | Gateway de Canais com adaptadores por provedor | Evita acoplamento a um BSP; provedores mudam, caem ou têm custos distintos por canal |
| 2 | Consentimento como filtro dentro do serviço de audiência | Serviço e ledger de consentimento próprios, atualizados por respostas | Opt-in é modelo de dados, não validação secundária; exige histórico e origem |
| 3 | Envio síncrono da API ao provedor | Fluxo orientado a eventos: Scheduler, Orquestrador, Workers | Campanha e disparo têm escalas e falhas diferentes |
| 4 | Sem controle de duplicidade | `idempotency_key` gerada na criação e reserva no ledger antes do envio | Retry e reentrega de fila não podem gerar duplo disparo |
| 5 | Rate limit como detalhe do worker | Controle de Quotas como componente de primeira classe | Tier do WhatsApp e status do agente RCS são restrição de desenho |
| 6 | Webhook processado no mesmo request | Ingestor persiste e responde 200; Processador de Status é assíncrono | Evita timeout e perda de eventos; status chega fora de ordem |
| 7 | Fallback automático de canal | Fallback só com consentimento no canal alternativo | Conformidade tem prioridade sobre entrega |
| 8 | `C4Container` nativo do Mermaid | `flowchart` com `classDef` na paleta C4 | Sintaxe C4 é experimental e renderiza de forma instável |

**O que foi mantido do rascunho:** a decomposição em domínios de campanha e execução com broker entre eles, o Scheduler como container próprio e a ideia de ledger append-only para consentimento e auditoria — esta ainda marcada como `[A VALIDAR]`, pendente do [ADR-001](adr/ADR-001-ledger-consentimento-append-only.md).

---

## Método

O *discovery* foi conduzido com um agente Arquiteto de Software cujo prompt está versionado em [`prompts/arquiteto-de-software.md`](prompts/arquiteto-de-software.md).

Antes de qualquer proposta, o agente, rodando em modo de esclarecimento, devolveu **7 perguntas** (volume e criticidade, provedores, fallback, multi-tenant, stack, auditoria). Nenhuma foi respondida antes da geração dos diagramas. Por isso elas viraram a seção de *Lacunas* e as premissas marcadas como `[PREMISSA]`: sem essa marcação, seriam caixinhas de nome plausível e o desenho pareceria completo sem ser verdadeiro.

Sequência executada:

1. **Esclarecer** — perguntas antes de qualquer decisão difícil de reverter.
2. **Descrever** — texto em linguagem natural, com lacunas declaradas.
3. **Diagramar** — Mermaid gerado a partir da descrição.
4. **Revisar** — o desenho conferido contra as regras e prioridades do prompt.
5. **Registrar** — ajustes documentados com o motivo, não só o resultado.

---

## Reprodutibilidade

Os arquivos `.mmd` em `docs/diagramas/` são a fonte de verdade; o README apenas os exibe, dentro de marcadores `<!-- diagrama:NOME:inicio -->` e `<!-- diagrama:NOME:fim -->`. Para reinjetar o conteúdo dos `.mmd` nos blocos do README:

```
node scripts/sync-diagramas.mjs          # atualiza o README
node scripts/sync-diagramas.mjs --check  # falha se estiver dessincronizado
```

Para renderizar em SVG ou PNG localmente:

```
npm install -g @mermaid-js/mermaid-cli
mmdc -i docs/diagramas/c4-containers.mmd -o c4-containers.svg
```

> **[A VALIDAR]** Os quatro diagramas foram escritos com cuidado de sintaxe, mas ainda não foram renderizados. Rode o `mmdc` (ou abra o README no GitHub) e registre aqui qualquer correção feita.

---

## Este repositório como contexto para agentes

Um agente que for implementar este sistema lendo este repositório precisa de três coisas que um leitor humano dispensaria:

- **Invariantes escritas como regra**, não como prosa — a lista acima existe para ser citada literalmente num prompt de implementação e virar critério de aceitação de *pull request*.
- **Lacunas marcadas.** Um agente preenche silenciosamente o que não encontra. Um `[LACUNA]` explícito é instrução para perguntar, não para inventar.
- **Diagramas em código.** Um `.mmd` versionado é texto que o agente lê, compara com o código e usa para detectar divergência. Um PNG é opaco.

---

## Estrutura

```
.
├── README.md
├── adr/
│   ├── ADR-000-template.md
│   └── ADR-001-ledger-consentimento-append-only.md
├── docs/
│   ├── 01-descricao-sistema.md
│   ├── 02-decisoes-e-ajustes.md
│   └── diagramas/
│       ├── c4-contexto.mmd
│       ├── c4-containers.mmd
│       ├── sequencia-disparo-campanha.mmd
│       └── estado-mensagem.mmd
├── prompts/
│   └── arquiteto-de-software.md
└── scripts/
    └── sync-diagramas.mjs
```

---

## Status

Fase de *discovery* de documentação. **Nenhuma decisão aqui está fechada** — os ADRs estão em status `Proposto`, as lacunas seguem abertas e a implementação ainda não começou. Este repositório é insumo para decisão, não a decisão.

## Licença

[MIT](LICENSE).
