# Plano de Estabilização do Cadastro do Vendedor e Compliance

Este plano visa corrigir o erro de atualização de perfil, implementar o salvamento parcial por etapas, centralizar o cálculo de progresso e separar definitivamente os conceitos de Cadastro (dados do usuário) e Compliance (decisão administrativa).

## Problemas Identificados
- Erros de `::text` em queries SQL dinâmicas (no `atualizarDocumentosVendedorFn`).
- Falta de uma fonte única de verdade para o status do vendedor.
- Confusão entre "Cadastro Completo" e "Compliance Aprovado".
- Necessidade de persistência robusta por etapa no banco de dados.

## Alterações Técnicas

### 1. Banco de Dados (`src/db/perfil.server.ts` e `src/db/vendedores-compliance.server.ts`)
- Unificar o schema de `profiles` para incluir colunas de compliance e progresso se ainda não existirem.
- Garantir que `status_compliance` utilize o padrão canônico: `NAO_ENVIADO`, `AGUARDANDO_ANALISE`, `EM_ANALISE`, `PENDENCIA`, `APROVADO`, `REPROVADO`, `BLOQUEADO`.
- Adicionar colunas `compliance_motivo_pendencia` (text), `compliance_data_analise` (timestamptz) e `compliance_responsavel_id` (uuid) diretamente em `profiles` para simplificar a leitura de status.

### 2. Backend Logic (`src/db/vendedores-compliance.server.ts`)
- **Centralização do Progresso**: Criar `calcularProgressoVendedor(perfil)` que retorna o percentual e o status de cada etapa (Dados, Endereço, Documentos, Selfie).
- **Refatoração do Update**: Corrigir `atualizarDocumentosVendedorFn` para montar a query Drizzle de forma totalmente dinâmica, evitando `sql.raw` com variáveis não tratadas ou `::text` órfãos.
- **Transição de Status**: Implementar lógica rigorosa onde o `status_compliance` só muda para `AGUARDANDO_ANALISE` quando o usuário clica em "Enviar para Análise" e o cadastro está completo.

### 3. Server Functions (`src/lib/vendedor.functions.ts` e `src/lib/vendedores-compliance.functions.ts`)
- Atualizar as assinaturas e validações Zod para suportar os novos campos e a lógica de persistência parcial.
- Garantir que `obterMeuPerfilFn` retorne os dados de progresso calculados.

### 4. Frontend (`src/routes/vendedor.onboarding.tsx` e Admin)
- Ajustar o Onboarding para refletir o status de progresso real vindo do banco.
- Garantir que o botão "Salvar e Continuar" persista os dados da etapa atual no banco sem exigir as próximas.
- No Admin (`admin/vendedores.tsx` e `admin/vendedor.$id.tsx`), unificar os rótulos e as cores baseados no `status_compliance` canônico.

## Etapas de Implementação

1. **Correção do SQL e Schema**: Ajustar `src/db/perfil.server.ts` e `src/lib/vendedor.functions.ts` (correção da query).
2. **Motor de Status**: Implementar `calcularProgressoVendedor` em `src/db/vendedores-compliance.server.ts`.
3. **Fluxo de Análise**: Refinar as funções de `assumirAnalise` e criar `solicitarPendenciaCompliance` e `aprovarVendedorCompliance`.
4. **Interface**: Atualizar as telas do Vendedor e do Admin.

## Verificação
- Executar os 10 testes obrigatórios descritos pelo usuário.
- Validar especificamente com o profile `a1d4213e-7676-4397-81ce-37792e21e776`.
