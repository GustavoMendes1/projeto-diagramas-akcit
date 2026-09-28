# Descrição do sistema

## 1. Escopo

O sistema é um portal web usado por times de negócio e marketing para:

- criar, aprovar, agendar e disparar campanhas de mensagens proativas;
- gerenciar templates de mensagem e selecionar/segmentar públicos-alvo;
- escolher o canal de envio (RCS, WhatsApp ou ambos, com fallback);
- acompanhar entrega, leitura, resposta e erros em tempo real ou quase real;
- respeitar limites de envio (rate limits, tier de qualidade do WhatsApp, janela de 24h, status do agente RCS);
- respeitar opt-in, opt-out e preferências de consentimento dos destinatários.

## 2. Nível da visão

Visão de **contexto** e de **containers** (C4, níveis 1 e 2), mais uma jornada crítica em sequência e o ciclo de vida da mensagem em estados. Não detalha componentes internos, esquema físico de banco, escolha de tecnologia nem infraestrutura de deploy.

## 3. Limites e responsabilidades

O sistema é dividido em domínios com escalas e falhas diferentes.

| Domínio | Responsabilidade | Característica |
| --- | --- | --- |
| **Campanha** (controle) | Templates, segmentos, aprovação, agendamento, consulta de resultados | Baixo volume, consistência forte, usuário humano no fluxo |
| **Execução** (dados) | Expansão da campanha em mensagens, controle de quota, envio, retry, fallback, processamento de webhooks | Alto volume, assíncrono, tolerante a falhas parciais |
| **Consentimento** (transversal) | Ledger de opt-in e opt-out com histórico e origem | Consultado antes de todo envio; parte do modelo de dados |

**Dentro do escopo:** tudo acima, mais a camada de abstração de provedores, a observabilidade específica de mensageria e a trilha de auditoria.

**Fora do escopo:**

- aprovação de templates junto à Meta e às operadoras;
- escolha e contratação de BSP ou agregador;
- regras de negócio de marketing;
- parecer jurídico de LGPD e conformidade;
- gestão de projeto, priorização de backlog e planejamento de sprints;
- código de implementação.

## 4. Integrações

| Sistema externo | Uso | Observação |
| --- | --- | --- |
| BSP / Cloud API do WhatsApp | Envio de templates e mensagens; webhooks de status e respostas | Sujeito a tier de qualidade e limites de conversas |
| Agregador / operadoras RCS | Envio RCS; webhooks de entrega e leitura | Depende do status do agente RCS por operadora |
| Provedor de identidade | Autenticação e papéis (SSO) | `[PREMISSA]` OIDC ou SAML |
| CRM / CDP | Fonte de contatos e segmentos | `[PREMISSA]` importação por arquivo ou API |

Toda chamada a provedor de mensagens passa pelo **Gateway de Canais**. Nenhum outro componente conhece o formato de API de um BSP.

## 5. Restrições e prioridades

- **Ordem de prioridade em conflito:** conformidade/consentimento > confiabilidade de entrega > rastreabilidade/auditoria > performance > custo por mensagem.
- **Conformidade:** LGPD (dados de contato), políticas da Meta para WhatsApp Business, diretrizes GSMA para RCS.
- **Rate limit e qualidade de conta** são restrição de primeira classe, tratada em componente próprio (Controle de Quotas).
- **Idempotência e deduplicação** em todo o caminho de envio.
- **Sem acoplamento a um único provedor:** abstração de canais obrigatória.
- **Webhooks** são parte central da arquitetura: status de entrega e respostas chegam de forma assíncrona e fora de ordem.
- **Sem over-engineering:** apenas envio e tratamento de status exigem near-real-time; relatórios agregados podem ser batch.
- **Observabilidade específica de mensageria:** status de entrega, taxa de leitura, erros por provedor e tempo de fila.

## 6. Invariantes

Ver a lista no [README](../README.md#invariantes). São o critério de aceitação de qualquer mudança.

## 7. Lacunas e premissas

| # | Lacuna | Premissa adotada | Impacto se estiver errada |
| --- | --- | --- | --- |
| 1 | Volume diário/mensal e pico de campanha | `[PREMISSA]` volume médio-alto com picos (ordem de milhões por mês) | Define se basta fila gerenciada e workers ou se é preciso particionar por tenant e canal |
| 2 | SLA de entrega e criticidade | `[PREMISSA]` mensagens promocionais ou informativas, tolerantes a minutos de atraso; sem OTP | Se houver mensagens críticas, exige filas priorizadas e caminho dedicado |
| 3 | Multi-tenant | `[PREMISSA]` sim, isolamento lógico por `tenant_id` | Muda modelo de dados, quotas e credenciais de provedor |
| 4 | BSP e agregador | `[PREMISSA]` um provedor por canal, trocável por adaptador | Custos e recursos (ex.: mensagens ricas de RCS) variam por provedor |
| 5 | Fallback entre canais | `[PREMISSA]` RCS para WhatsApp, condicionado a consentimento no canal de destino | Afeta custo e regra de consentimento por canal |
| 6 | Auditoria e retenção | `[PREMISSA]` trilha append-only de consentimento e envios | Prazo de retenção e imutabilidade dependem de análise jurídica |
| 7 | Stack e infraestrutura de deploy | `[LACUNA]` sem premissa; diagramas agnósticos de tecnologia | Escolha de broker, banco e orquestração fica para a próxima etapa |
