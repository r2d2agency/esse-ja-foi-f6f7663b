# Plano de Ação - Correção das Ações de Documentação do Veículo (Admin)

Este plano visa implementar as funcionalidades de aprovação e solicitação de novo envio para o CRLV-e na aba de documentação do veículo no painel administrativo, garantindo persistência no banco de dados e sincronização com o status do veículo.

## 1. Backend (Banco de Dados e Server Functions)

- **Schema**: Garantir que a tabela `profiles` tenha as colunas de status de documentos (já existem no `vendedores-compliance.server.ts`, mas verificaremos a integridade).
- **Server Functions**:
    - Criar `atualizarStatusDocumentoVeiculoFn` em `src/lib/admin-veiculo-detalhe.functions.ts` para lidar com a atualização do status do CRLV no perfil vinculado ao veículo.
    - Esta função também registrará o histórico em `compliance_historico` ou na tabela de `logs`.
    - Adicionar validação para impedir a liberação do veículo para vistoria se o CRLV não estiver `APROVADO`.

## 2. Frontend (Interface do Admin)

- **Componente de Documentação** (em `src/routes/admin/veiculo.$id.tsx`):
    - Implementar o botão "Aprovar documento" com um modal de confirmação do shadcn/ui.
    - Implementar o botão "Solicitar novo envio" com um modal contendo:
        - Motivos pré-definidos (Ilegível, Incompleto, Divergente, Desatualizado, Dados não conferem, Outro).
        - Campo de observação complementar.
    - Adicionar estados de loading e toasts de sucesso/erro.
    - Realizar o refetch das queries `admin-veiculo-detalhe` e `onboarding-status` após as ações para atualizar a interface imediatamente.

## 3. Lógica de Negócio e Checklist

- **Sincronização**: O checklist da análise do veículo refletirá o status do CRLV. Só aparecerá como "Concluído" se o status for `APROVADO`.
- **Bloqueio de Fluxo**: O botão "Liberar para vistoria" no cabeçalho será bloqueado no backend se o CRLV estiver pendente, e a UI refletirá isso com um tooltip ou mensagem de alerta se necessário.

## Detalhes Técnicos

- **Status do Documento**: `AGUARDANDO_ANALISE`, `APROVADO`, `NOVO_ENVIO_SOLICITADO`, `REJEITADO`.
- **Persistência**: As alterações serão feitas diretamente na tabela `profiles` do vendedor, já que o CRLV está vinculado ao perfil dele neste fluxo.
- **Auditoria**: Cada ação será registrada com o ID do administrador, timestamp e detalhes da alteração.
