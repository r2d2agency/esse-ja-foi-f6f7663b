# Plano de Implementação: Fechamento Financeiro e Repasse ao Vendedor

Este plano detalha a implementação das funcionalidades restantes e o refinamento do módulo financeiro para garantir total conformidade com os requisitos detalhados de comissão, repasse e auditoria.

## Alterações Propostas

### 1. Reforço da Segurança e Compliance nos Dados Bancários
- **Validação de Documento**: Adicionar validação no backend para garantir que o CPF/CNPJ da chave Pix corresponda ao documento do perfil do vendedor.
- **Histórico de Alterações**: Registrar no log de auditoria sempre que uma chave Pix for alterada.

### 2. Aperfeiçoamento do Ledger Financeiro (Livro Razão)
- **Movimentação de Entrada**: Garantir que a confirmação de pagamento do comprador registre explicitamente a entrada no `financeiro_ledger`.
- **Integridade**: Adicionar gatilhos de segurança para evitar que uma negociação gere mais de um conjunto de lançamentos no ledger.

### 3. Fluxo de Autorização e Pagamento (Payout)
- **Visualização de Comprovante**: Implementar o upload e visualização do comprovante de transferência (PDF/Imagem) na tela de detalhe do repasse.
- **Notificações em Tempo Real**: Disparar notificações push/in-app para o vendedor assim que o repasse for marcado como "CONCLUIDO".

### 4. Ajustes na Interface Administrativa
- **Filtros Avançados**: Adicionar filtros por período e valor na listagem de repasses.
- **Exportação (Placeholder)**: Preparar a estrutura para exportação de relatórios financeiros em CSV/Excel.

## Detalhes Técnicos

- **Banco de Dados**: Extensão da tabela `financeiro_auditoria` e `financeiro_ledger`.
- **Server Functions**: Atualização em `financeiro.functions.ts` e `pagamentos.functions.ts`.
- **Segurança**: Uso de `has_role` e verificação de `adminId` em todas as operações de autorização.
- **Frontend**: Novos componentes de UI em `src/components/financeiro/` para exibição de status e logs.

## Próximos Passos

1. Atualizar esquemas de banco de dados (`ensureFinanceiroSchema`).
2. Implementar lógica de validação de dados bancários.
3. Integrar registros de entrada no ledger durante a conciliação de pagamentos.
4. Refinar telas administrativas de pagamentos e repasses.
