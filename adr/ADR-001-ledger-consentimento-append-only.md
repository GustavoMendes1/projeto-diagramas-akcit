# ADR-001: Consentimento como ledger append-only consultado antes de todo envio

- **Status:** Proposto
- **Data:** [COMPLETAR]
- **Decisores:** [COMPLETAR]

## Contexto

Consentimento (opt-in e opt-out) é a prioridade nº 1 do sistema: conformidade/consentimento > confiabilidade de entrega > rastreabilidade > performance > custo. É preciso provar, em auditoria, que cada mensagem foi enviada com consentimento vigente no canal, e que cada opt-out (inclusive recebido por resposta no canal) foi respeitado.

## Alternativas avaliadas

### A. Flag de consentimento no cadastro do contato
- Prós: simples, consulta barata.
- Contras: sobrescreve o histórico; não prova o estado em uma data passada; não registra origem nem canal.

### B. Tabela de consentimento mutável com coluna de auditoria
- Prós: histórico parcial, modelo familiar.
- Contras: a aplicação pode alterar o histórico; trilha não é imutável.

### C. Ledger append-only de eventos de consentimento, com projeção do estado atual
- Prós: histórico completo com origem e timestamp; reconstrói o estado em qualquer data; opt-out por resposta vira apenas mais um evento.
- Contras: exige projeção para consulta rápida; mais complexidade; retenção precisa de definição jurídica.

## Decisão

Alternativa **C**. Cada mudança é um evento `(contato, canal, tipo, origem, timestamp)`. O estado vigente é uma projeção consultada pelo Orquestrador antes do envio e revalidada quando a mensagem é reservada pelo Worker (invariante 1).

## Consequências

- Positivas: rastreabilidade completa e prova de consentimento por canal.
- Negativas: custo de manter e verificar a projeção; latência extra na expansão da campanha.
- Riscos: janela entre a checagem do Orquestrador e o envio (opt-out recebido no intervalo). Mitigação: revalidação no Worker.

## Lacunas

- `[A VALIDAR]` Prazo de retenção e regras de eliminação (LGPD) — depende de parecer jurídico.
- `[A VALIDAR]` Se a integridade exige encadeamento por hash ou basta permissão de escrita restrita.
- `[LACUNA]` Tecnologia de armazenamento (stack não informada).
