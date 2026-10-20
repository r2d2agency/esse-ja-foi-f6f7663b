# Plan: Refinamento do Módulo Financeiro e Auditoria

O objetivo é aprimorar o controle financeiro, permitindo alterações manuais de status para pagamentos realizados fora da plataforma, garantindo a integridade do Livro Razão (Ledger) e a rastreabilidade total das operações.

## Ações de Design e UX

- **Novo Fluxo de Baixa Manual**: Adição de modal no Painel Administrativo para informar pagamentos recebidos por outros meios (TED, Depósito, Dinheiro).
- **Indicadores de Auditoria**: Exibição clara no dashboard administrativo de entradas manuais vs. automáticas.
- **Timeline Financeira**: Registro visual detalhado de quem, quando e por que um status foi alterado manualmente.

## Detalhes Técnicos

### Backend (Banco de Dados e Server Functions)

- **Novas Funções de Transação**: Implementação de `confirmarPagamentoManual` em `src/db/pagamentos.server.ts` que executa em bloco atômico:
  - Atualização da negociação para `PAGAMENTO_CONFIRMADO`.
  - Inserção no `financeiro_ledger` com o tipo `ENTRADA_MANUAL`.
  - Registro de auditoria com o `admin_id`.
  - Notificação automática para o vendedor e comprador.
- **Validação de Papéis**: Restrição das funções de alteração manual apenas para usuários com role `admin` ou `operacao`.

### Frontend (UI/UX)

- **Componente de Ação Manual**: Botão "Informar Pagamento Manual" na tela de detalhe da negociação (`src/routes/admin/negociacao.$id.tsx`).
- **Formulário de Justificativa**: Campo obrigatório de "Observação/Referência" e upload opcional de comprovante para baixas manuais.
- **Refatoração do Ledger**: Melhoria na exibição do histórico financeiro para destacar transações que não passaram pelo gateway de pagamento automático.

## Invariants

- O `financeiro_ledger` deve permanecer imutável; correções devem ser feitas com novas entradas de estorno/ajuste.
- Toda alteração manual DEVE disparar o ciclo de liberação para entrega e repasse, mantendo a consistência do fluxo do veículo.
