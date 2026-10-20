# Plano: Módulo Administrativo de Vendedores, Documentos e Compliance

Implementação do fluxo completo de análise cadastral e compliance para vendedores no Painel Admin.

## Etapa 1: Infraestrutura de Banco de Dados
- Criar `src/db/vendedores-compliance.server.ts` para gerenciar tabelas de `compliance_analise` (status, responsável, observações) e `compliance_pendencias` (motivos de reenvio).
- Adicionar colunas necessárias na tabela `profiles` (documentos, CPF, endereço completo) caso não existam.

## Etapa 2: Funções de Servidor (Server Functions)
- Desenvolver `src/lib/vendedores-compliance.functions.ts` com funções para:
  - Listar vendedores com filtros avançados.
  - Obter detalhes completos do vendedor (dados, documentos, veículos, histórico).
  - Assumir análise, aprovar/reprovar documentos e cadastro.
  - Solicitar pendências (reenvio de documentos).

## Etapa 3: Interface Administrativa (Frontend)
- **Listagem**: Reconstruir `src/routes/admin/vendedores.tsx` com tabela moderna, busca global e filtros de status.
- **Detalhe do Vendedor**: Criar `src/routes/admin/vendedor.$id.tsx` com abas (Resumo, Dados, Documentos, Compliance, Veículos, Histórico).
- **Visualizador de Documentos**: Implementar componente de modal para inspeção de fotos (zoom, rotação).
- **Compliance e Histórico**: Timeline de eventos e checklist de validação.

## Etapa 4: Integração com Portal do Vendedor
- Garantir que solicitações de pendência reflitam no dashboard do vendedor.

## Detalhes Técnicos
- **Segurança**: URLs temporárias para documentos (privados), mascaramento de CPF na listagem.
- **Identidade Visual**: Navy-blue (#0F172A), Teal/Verde para ações, tipografia Inter.
- **UX**: Desktop-first, feedback instantâneo de ações, persistência de histórico.
