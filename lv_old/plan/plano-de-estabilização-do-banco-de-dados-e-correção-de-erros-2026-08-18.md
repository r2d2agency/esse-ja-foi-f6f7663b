# Plano de Estabilização do Banco de Dados e Correção de Erros

O objetivo deste plano é resolver as inconsistências de banco de dados (colunas faltantes, tabelas inexistentes e duplicidade de índices) que estão impedindo o funcionamento correto do sistema, além de corrigir o erro de navegação ao tentar acessar os detalhes de um veículo.

## Problemas Identificados

1.  **Erro de Navegação**: Usuário relatou "veículo não encontrado" ao clicar em um veículo cadastrado.
2.  **Inconsistência de Schema**:
    *   Erro: `relation "laudo_fotos" does not exist` ao tentar criar `anuncios_fotos`.
    *   Erro: `column p.cnpj does not exist` em consultas de compradores.
    *   Erro: `relation "documentos_entidade_tipo_uidx" already exists` (conflito de migração manual).
    *   Erro: `column l.anuncio_id does not exist` em relatórios de leilão.
3.  **Divergência entre Drizzle e SQL Manual**: O projeto usa Drizzle ORM para a base, mas a maioria das tabelas e colunas foi criada via `drizzle-orm/sql` manual em funções `ensure...Schema`.

## Ações Técnicas

### 1. Sincronização e Estabilização do Schema (Backend)
*   **`src/db/perfil.server.ts`**: Adicionar explicitamente a coluna `cnpj` e `tipo_pessoa` (caso falte no SQL bruto) na lista de colunas sincronizadas.
*   **`src/db/anuncios.server.ts`**: Corrigir a ordem de criação ou remover a dependência direta de `laudo_fotos` se a tabela ainda não existir, garantindo que `ensureLaudoSchema` rode antes.
*   **`src/db/negociacoes.server.ts`**: Corrigir a consulta de relatórios que tenta acessar `l.anuncio_id` (a coluna correta no schema `leiloes` parece ser `veiculo_id`, ou o join deve ser ajustado).
*   **`src/db/index.ts`**: Refinar a ordem de execução dos `ensure...Schema` para respeitar as chaves estrangeiras.

### 2. Correção da Visualização de Veículo (Admin/Vendedor)
*   **`src/lib/admin-veiculos.functions.ts`**: Verificar se a função de listagem está retornando os IDs corretos.
*   **`src/routes/admin/veiculo.$id.tsx`**: Validar se o parâmetro `$id` está sendo extraído e passado corretamente para `getVeiculoDetalheAdminFn`.
*   **`src/lib/admin-veiculo-detalhe.functions.ts`**: Adicionar logs detalhados para capturar o erro exato quando o banco retorna "não encontrado" (pode ser um erro de cast de UUID ou permissão).

### 3. Limpeza de Logs e Auditoria
*   **`src/lib/logs.functions.ts`**: Garantir que a limpeza de logs funcione para liberar espaço e facilitar o debug de novos problemas.

## User-facing details (Technical)
*   As falhas de banco de dados ocorrem devido a uma mistura de migrações automáticas do Drizzle com comandos SQL manuais que tentam alterar as mesmas tabelas simultaneamente.
*   A falta da coluna `cnpj` no perfil de compradores impede a listagem no painel administrativo.
*   O erro de "veículo não encontrado" geralmente ocorre quando o ID passado na URL não coincide com o UUID no banco ou quando a query de busca falha silenciosamente devido a uma coluna inexistente.
