# Plano de Estabilização do Checklist de Análise do Veículo

Este plano visa corrigir o checklist de análise administrativa de veículos, garantindo que o status de "Dados Cadastrais" e "Fotos Obrigatórias" seja calculado dinamicamente e impeça a liberação para vistoria caso existam pendências reais.

## Alterações Técnicas

### 1. Motor de Compliance do Veículo (Backend)
- Criar `src/db/veiculos-compliance.server.ts`:
  - `calcularProgressoVeiculo`: Valida campos obrigatórios (Renavam, Ano, KM, Cor, Combustível, Câmbio) e contagem de fotos (mínimo 4).
  - `canReleaseForInspection`: Consolida o status de Compliance do Vendedor, Contrato, Dados do Veículo, CRLV e Fotos.

### 2. Funções de Servidor (TanStack Start)
- Atualizar `src/lib/admin-veiculo-detalhe.functions.ts`:
  - `getVeiculoDetalheAdminFn`: Incluir o status do contrato e os resultados do novo motor de compliance no retorno.
  - `atualizarStatusAnaliseFn`: Adicionar validação robusta no backend para impedir a transição para `PRONTO_PARA_VISTORIA` se o motor de compliance retornar pendências.

### 3. Interface Administrativa (Frontend)
- Atualizar `src/routes/admin/veiculo.$id.tsx`:
  - Aba **Análise**: Exibir lista detalhada de campos faltantes em "Dados Cadastrais".
  - Aba **Análise**: Exibir contagem real de fotos (Ex: "3 de 4 enviadas").
  - Botão **Liberar para Vistoria**: Desabilitar visualmente se `ready` for falso, com feedback de "Requisitos pendentes".
  - Ação **Revisar dados**: Adicionar link direto para a aba de dados quando houver pendência.

## Verificação
- Validar se o veículo Onix (ABS1245) exibe "Renavam não informado" e bloqueia o botão.
- Validar se ao preencher os dados, o checklist atualiza automaticamente.
- Validar se o backend rejeita a mudança de status caso a requisição seja feita manualmente com pendências.
